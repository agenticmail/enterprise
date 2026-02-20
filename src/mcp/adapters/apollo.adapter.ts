/**
 * MCP Skill Adapter — Apollo.io
 *
 * Maps Apollo.io Sales Intelligence API v1 endpoints to MCP tool handlers.
 * Apollo provides people/company search, enrichment, and sequence management.
 *
 * Apollo API docs: https://apolloio.github.io/apollo-api-docs/
 */

import type { SkillAdapter, ToolHandler, ToolResult, ToolExecutionContext } from '../framework/types.js';

// ─── Helpers ────────────────────────────────────────────

function apolloError(err: unknown): ToolResult {
  if (err instanceof Error) {
    const data = (err as any).data;
    if (data && typeof data === 'object') {
      const msg = data.error || data.message || err.message;
      return { content: `Apollo API error: ${msg}`, isError: true };
    }
    return { content: `Apollo API error: ${err.message}`, isError: true };
  }
  return { content: `Apollo API error: ${String(err)}`, isError: true };
}

/** Format an Apollo person for display */
function formatPerson(person: any): string {
  const name = person.name || [person.first_name, person.last_name].filter(Boolean).join(' ') || '(no name)';
  const email = person.email || '(no email)';
  const title = person.title || '';
  const company = person.organization_name || person.organization?.name || '';
  const linkedin = person.linkedin_url ? ` -- ${person.linkedin_url}` : '';
  const titlePart = title ? `, ${title}` : '';
  const companyPart = company ? ` @ ${company}` : '';
  return `${name} <${email}>${titlePart}${companyPart}${linkedin} (ID: ${person.id})`;
}

/** Format an Apollo organization for display */
function formatOrganization(org: any): string {
  const name = org.name || '(unnamed)';
  const domain = org.primary_domain || org.website_url || '';
  const industry = org.industry || '';
  const employees = org.estimated_num_employees || '';
  const location = [org.city, org.state, org.country].filter(Boolean).join(', ');
  const extras: string[] = [];
  if (domain) extras.push(`domain: ${domain}`);
  if (industry) extras.push(`industry: ${industry}`);
  if (employees) extras.push(`~${employees} employees`);
  if (location) extras.push(location);
  const extraStr = extras.length > 0 ? ` -- ${extras.join(', ')}` : '';
  return `${name}${extraStr} (ID: ${org.id})`;
}

/** Format an Apollo sequence for display */
function formatSequence(seq: any): string {
  const name = seq.name || '(unnamed)';
  const active = seq.active ? 'active' : 'inactive';
  const numSteps = seq.num_steps || 0;
  const created = seq.created_at ? seq.created_at.slice(0, 10) : '';
  return `${name} -- ${active} -- ${numSteps} steps -- created: ${created} (ID: ${seq.id})`;
}

// ─── Tool: apollo_search_people ─────────────────────────

const searchPeople: ToolHandler = {
  description:
    'Search for people in Apollo.io database. Filter by job title, company, location, and more.',
  inputSchema: {
    type: 'object',
    properties: {
      q_keywords: {
        type: 'string',
        description: 'Keywords to search for (name, title, etc.)',
      },
      person_titles: {
        type: 'array',
        items: { type: 'string' },
        description: 'Filter by job titles (e.g. ["CEO", "VP Sales"])',
      },
      q_organization_domains: {
        type: 'array',
        items: { type: 'string' },
        description: 'Filter by company domains (e.g. ["google.com"])',
      },
      person_locations: {
        type: 'array',
        items: { type: 'string' },
        description: 'Filter by locations (e.g. ["San Francisco, CA"])',
      },
      organization_industry_tag_ids: {
        type: 'array',
        items: { type: 'string' },
        description: 'Filter by industry tag IDs',
      },
      per_page: {
        type: 'number',
        description: 'Results per page (default 25, max 100)',
      },
      page: {
        type: 'number',
        description: 'Page number (default 1)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {
        per_page: params.per_page ?? 25,
        page: params.page ?? 1,
      };
      if (params.q_keywords) body.q_keywords = params.q_keywords;
      if (params.person_titles?.length) body.person_titles = params.person_titles;
      if (params.q_organization_domains?.length) body.q_organization_domains = params.q_organization_domains;
      if (params.person_locations?.length) body.person_locations = params.person_locations;
      if (params.organization_industry_tag_ids?.length) body.organization_industry_tag_ids = params.organization_industry_tag_ids;

      const result = await ctx.apiExecutor.post('/mixed_people/search', body);

      const people: any[] = result.people || [];
      if (people.length === 0) {
        return { content: 'No people found matching the search criteria.' };
      }

      const lines = people.map((p: any) => formatPerson(p));
      const pagination = result.pagination || {};

      return {
        content: `Found ${pagination.total_entries || people.length} people (showing ${people.length}):\n${lines.join('\n')}`,
        metadata: { count: people.length, total: pagination.total_entries, page: pagination.page },
      };
    } catch (err) {
      return apolloError(err);
    }
  },
};

// ─── Tool: apollo_enrich_person ─────────────────────────

const enrichPerson: ToolHandler = {
  description:
    'Enrich a person record in Apollo.io. Provide an email, LinkedIn URL, or name + company to get detailed information.',
  inputSchema: {
    type: 'object',
    properties: {
      email: {
        type: 'string',
        description: 'Email address to look up',
      },
      linkedin_url: {
        type: 'string',
        description: 'LinkedIn profile URL',
      },
      first_name: {
        type: 'string',
        description: 'First name (use with last_name + domain)',
      },
      last_name: {
        type: 'string',
        description: 'Last name (use with first_name + domain)',
      },
      domain: {
        type: 'string',
        description: 'Company domain (use with first_name + last_name)',
      },
      reveal_personal_emails: {
        type: 'boolean',
        description: 'Whether to include personal emails in results (default: false)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {};
      if (params.email) body.email = params.email;
      if (params.linkedin_url) body.linkedin_url = params.linkedin_url;
      if (params.first_name) body.first_name = params.first_name;
      if (params.last_name) body.last_name = params.last_name;
      if (params.domain) body.domain = params.domain;
      if (params.reveal_personal_emails) body.reveal_personal_emails = params.reveal_personal_emails;

      if (!body.email && !body.linkedin_url && !(body.first_name && body.last_name && body.domain)) {
        return {
          content: 'Error: Provide an email, LinkedIn URL, or first_name + last_name + domain to enrich.',
          isError: true,
        };
      }

      const result = await ctx.apiExecutor.post('/people/match', body);

      const person = result.person;
      if (!person) {
        return { content: 'No matching person found for the provided information.' };
      }

      const details: string[] = [];
      details.push(`Name: ${person.name || 'unknown'}`);
      if (person.email) details.push(`Email: ${person.email}`);
      if (person.title) details.push(`Title: ${person.title}`);
      if (person.organization_name) details.push(`Company: ${person.organization_name}`);
      if (person.city) details.push(`Location: ${[person.city, person.state, person.country].filter(Boolean).join(', ')}`);
      if (person.linkedin_url) details.push(`LinkedIn: ${person.linkedin_url}`);
      if (person.phone_numbers?.length) details.push(`Phone: ${person.phone_numbers.map((p: any) => p.sanitized_number || p.raw_number).join(', ')}`);
      if (person.seniority) details.push(`Seniority: ${person.seniority}`);
      if (person.departments?.length) details.push(`Departments: ${person.departments.join(', ')}`);

      return {
        content: `Person enrichment result:\n${details.join('\n')}`,
        metadata: { personId: person.id, email: person.email },
      };
    } catch (err) {
      return apolloError(err);
    }
  },
};

// ─── Tool: apollo_search_organizations ──────────────────

const searchOrganizations: ToolHandler = {
  description:
    'Search for organizations (companies) in Apollo.io database. Filter by industry, size, location, and more.',
  inputSchema: {
    type: 'object',
    properties: {
      q_organization_keyword: {
        type: 'string',
        description: 'Keyword search for organization name',
      },
      organization_locations: {
        type: 'array',
        items: { type: 'string' },
        description: 'Filter by locations (e.g. ["United States"])',
      },
      organization_num_employees_ranges: {
        type: 'array',
        items: { type: 'string' },
        description: 'Employee count ranges (e.g. ["1,10", "11,50", "51,200"])',
      },
      organization_industry_tag_ids: {
        type: 'array',
        items: { type: 'string' },
        description: 'Industry tag IDs to filter by',
      },
      per_page: {
        type: 'number',
        description: 'Results per page (default 25)',
      },
      page: {
        type: 'number',
        description: 'Page number (default 1)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = {
        per_page: params.per_page ?? 25,
        page: params.page ?? 1,
      };
      if (params.q_organization_keyword) body.q_organization_keyword = params.q_organization_keyword;
      if (params.organization_locations?.length) body.organization_locations = params.organization_locations;
      if (params.organization_num_employees_ranges?.length) body.organization_num_employees_ranges = params.organization_num_employees_ranges;
      if (params.organization_industry_tag_ids?.length) body.organization_industry_tag_ids = params.organization_industry_tag_ids;

      const result = await ctx.apiExecutor.post('/mixed_companies/search', body);

      const orgs: any[] = result.organizations || result.accounts || [];
      if (orgs.length === 0) {
        return { content: 'No organizations found matching the search criteria.' };
      }

      const lines = orgs.map((o: any) => formatOrganization(o));
      const pagination = result.pagination || {};

      return {
        content: `Found ${pagination.total_entries || orgs.length} organizations (showing ${orgs.length}):\n${lines.join('\n')}`,
        metadata: { count: orgs.length, total: pagination.total_entries },
      };
    } catch (err) {
      return apolloError(err);
    }
  },
};

// ─── Tool: apollo_create_contact ────────────────────────

const createContact: ToolHandler = {
  description:
    'Create a new contact in your Apollo.io account. Provide at least an email address.',
  inputSchema: {
    type: 'object',
    properties: {
      first_name: {
        type: 'string',
        description: 'First name',
      },
      last_name: {
        type: 'string',
        description: 'Last name',
      },
      email: {
        type: 'string',
        description: 'Email address',
      },
      title: {
        type: 'string',
        description: 'Job title',
      },
      organization_name: {
        type: 'string',
        description: 'Company name',
      },
      phone_number: {
        type: 'string',
        description: 'Phone number',
      },
      label_names: {
        type: 'array',
        items: { type: 'string' },
        description: 'Labels to apply to the contact',
      },
    },
    required: ['email'],
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const body: Record<string, any> = { email: params.email };
      if (params.first_name) body.first_name = params.first_name;
      if (params.last_name) body.last_name = params.last_name;
      if (params.title) body.title = params.title;
      if (params.organization_name) body.organization_name = params.organization_name;
      if (params.phone_number) body.typed_custom_fields = { phone_number: params.phone_number };
      if (params.label_names?.length) body.label_names = params.label_names;

      const result = await ctx.apiExecutor.post('/contacts', body);

      const contact = result.contact || result;
      return {
        content: `Contact created: ${formatPerson(contact)}`,
        metadata: {
          contactId: contact.id,
          email: contact.email,
        },
      };
    } catch (err) {
      return apolloError(err);
    }
  },
};

// ─── Tool: apollo_list_sequences ────────────────────────

const listSequences: ToolHandler = {
  description:
    'List email sequences in your Apollo.io account.',
  inputSchema: {
    type: 'object',
    properties: {
      per_page: {
        type: 'number',
        description: 'Results per page (default 25)',
      },
      page: {
        type: 'number',
        description: 'Page number (default 1)',
      },
    },
  },

  async execute(params: Record<string, any>, ctx: ToolExecutionContext): Promise<ToolResult> {
    try {
      const query: Record<string, string> = {
        per_page: String(params.per_page ?? 25),
        page: String(params.page ?? 1),
      };

      const result = await ctx.apiExecutor.get('/emailer_campaigns', query);

      const sequences: any[] = result.emailer_campaigns || [];
      if (sequences.length === 0) {
        return { content: 'No sequences found.' };
      }

      const lines = sequences.map((s: any) => formatSequence(s));

      return {
        content: `Found ${sequences.length} sequences:\n${lines.join('\n')}`,
        metadata: { count: sequences.length },
      };
    } catch (err) {
      return apolloError(err);
    }
  },
};

// ─── Adapter Export ─────────────────────────────────────

export const apolloAdapter: SkillAdapter = {
  skillId: 'apollo-io',
  name: 'Apollo.io Sales Intelligence',
  baseUrl: 'https://api.apollo.io/v1',
  auth: {
    type: 'api_key',
    headerName: 'X-Api-Key',
  },
  tools: {
    apollo_search_people: searchPeople,
    apollo_enrich_person: enrichPerson,
    apollo_search_organizations: searchOrganizations,
    apollo_create_contact: createContact,
    apollo_list_sequences: listSequences,
  },
  rateLimits: {
    requestsPerSecond: 5,
    burstLimit: 10,
  },
};
