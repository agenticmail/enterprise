/**
 * Google Contacts (People API) Tools
 *
 * Search, list, create, and update contacts via Google People API v1.
 */

import type { AnyAgentTool, ToolCreationOptions } from '../../types.js';
import { jsonResult, errorResult } from '../../common.js';
import type { GoogleToolsConfig } from './index.js';

const BASE = 'https://people.googleapis.com/v1';

async function papi(token: string, path: string, opts?: { method?: string; body?: any; query?: Record<string, string> }): Promise<any> {
  const url = new URL(BASE + path);
  if (opts?.query) for (const [k, v] of Object.entries(opts.query)) { if (v) url.searchParams.set(k, v); }
  const res = await fetch(url.toString(), {
    method: opts?.method || 'GET',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: opts?.body ? JSON.stringify(opts.body) : undefined,
  });
  if (!res.ok) { const err = await res.text(); throw new Error(`People API ${res.status}: ${err}`); }
  return res.json();
}

function mapPerson(p: any) {
  return {
    resourceName: p.resourceName,
    name: p.names?.[0]?.displayName,
    firstName: p.names?.[0]?.givenName,
    lastName: p.names?.[0]?.familyName,
    emails: (p.emailAddresses || []).map((e: any) => ({ value: e.value, type: e.type })),
    phones: (p.phoneNumbers || []).map((ph: any) => ({ value: ph.value, type: ph.type })),
    organization: p.organizations?.[0]?.name,
    jobTitle: p.organizations?.[0]?.title,
    department: p.organizations?.[0]?.department,
    addresses: (p.addresses || []).map((a: any) => ({ formatted: a.formattedValue, type: a.type })),
    birthday: p.birthdays?.[0]?.date ? `${p.birthdays[0].date.year || '????'}-${String(p.birthdays[0].date.month).padStart(2, '0')}-${String(p.birthdays[0].date.day).padStart(2, '0')}` : undefined,
    notes: p.biographies?.[0]?.value,
  };
}

const PERSON_FIELDS = 'names,emailAddresses,phoneNumbers,organizations,addresses,birthdays,biographies';

export function createGoogleContactsTools(config: GoogleToolsConfig, _options?: ToolCreationOptions): AnyAgentTool[] {
  const tp = config.tokenProvider;
  return [
    {
      name: 'google_contacts_list',
      description: 'List Google Contacts.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          maxResults: { type: 'number', description: 'Max contacts to return (default: 50, max: 200)' },
          sortOrder: { type: 'string', description: '"FIRST_NAME_ASCENDING" or "LAST_NAME_ASCENDING"' },
        },
        required: [],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const data = await papi(token, '/people/me/connections', {
            query: {
              personFields: PERSON_FIELDS,
              pageSize: String(Math.min(params.maxResults || 50, 200)),
              sortOrder: params.sortOrder || 'FIRST_NAME_ASCENDING',
            },
          });
          const contacts = (data.connections || []).map(mapPerson);
          return jsonResult({ contacts, count: contacts.length, totalPeople: data.totalPeople });
        } catch (e: any) { return errorResult(e.message); }
      },
    },
    {
      name: 'google_contacts_search',
      description: 'Search contacts by name/email/phone.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          query: { type: 'string', description: 'Search term (required)' },
          maxResults: { type: 'number', description: 'Max results (default: 20)' },
        },
        required: ['query'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const data = await papi(token, '/people:searchContacts', {
            query: {
              query: params.query,
              readMask: PERSON_FIELDS,
              pageSize: String(Math.min(params.maxResults || 20, 30)),
            },
          });
          const contacts = (data.results || []).map((r: any) => mapPerson(r.person));
          return jsonResult({ contacts, count: contacts.length, query: params.query });
        } catch (e: any) { return errorResult(e.message); }
      },
    },
    {
      name: 'google_contacts_search_directory',
      description: 'Search company directory.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          query: { type: 'string', description: 'Search term (required)' },
          maxResults: { type: 'number', description: 'Max results (default: 20)' },
        },
        required: ['query'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const data = await papi(token, '/people:searchDirectoryPeople', {
            query: {
              query: params.query,
              readMask: PERSON_FIELDS,
              pageSize: String(Math.min(params.maxResults || 20, 50)),
              sources: 'DIRECTORY_SOURCE_TYPE_DOMAIN_PROFILE',
            },
          });
          const people = (data.people || []).map(mapPerson);
          return jsonResult({ people, count: people.length, query: params.query });
        } catch (e: any) { return errorResult(e.message); }
      },
    },
    {
      name: 'google_contacts_create',
      description: 'Create a contact.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          firstName: { type: 'string', description: 'First name (required)' },
          lastName: { type: 'string', description: 'Last name' },
          email: { type: 'string', description: 'Email address' },
          phone: { type: 'string', description: 'Phone number' },
          organization: { type: 'string', description: 'Company/organization name' },
          jobTitle: { type: 'string', description: 'Job title' },
          notes: { type: 'string', description: 'Notes about this contact' },
        },
        required: ['firstName'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const person: any = { names: [{ givenName: params.firstName, familyName: params.lastName }] };
          if (params.email) person.emailAddresses = [{ value: params.email, type: 'work' }];
          if (params.phone) person.phoneNumbers = [{ value: params.phone, type: 'work' }];
          if (params.organization || params.jobTitle) {
            person.organizations = [{ name: params.organization, title: params.jobTitle }];
          }
          if (params.notes) person.biographies = [{ value: params.notes, contentType: 'TEXT_PLAIN' }];
          const result = await papi(token, '/people:createContact', {
            method: 'POST', body: person,
            query: { personFields: PERSON_FIELDS },
          });
          return jsonResult({ created: true, contact: mapPerson(result) });
        } catch (e: any) { return errorResult(e.message); }
      },
    },
    {
      name: 'google_contacts_update',
      description: 'Update a contact.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          resourceName: { type: 'string', description: 'Contact resource name, e.g. "people/c1234567890" (required)' },
          firstName: { type: 'string', description: 'New first name' },
          lastName: { type: 'string', description: 'New last name' },
          email: { type: 'string', description: 'New email' },
          phone: { type: 'string', description: 'New phone' },
          organization: { type: 'string', description: 'New organization' },
          jobTitle: { type: 'string', description: 'New job title' },
        },
        required: ['resourceName'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          // Get current etag
          const current = await papi(token, `/${params.resourceName}`, {
            query: { personFields: PERSON_FIELDS },
          });
          const person: any = { etag: current.etag };
          const updateFields: string[] = [];
          if (params.firstName || params.lastName) {
            person.names = [{ givenName: params.firstName || current.names?.[0]?.givenName, familyName: params.lastName || current.names?.[0]?.familyName }];
            updateFields.push('names');
          }
          if (params.email) { person.emailAddresses = [{ value: params.email, type: 'work' }]; updateFields.push('emailAddresses'); }
          if (params.phone) { person.phoneNumbers = [{ value: params.phone, type: 'work' }]; updateFields.push('phoneNumbers'); }
          if (params.organization || params.jobTitle) {
            person.organizations = [{ name: params.organization || current.organizations?.[0]?.name, title: params.jobTitle || current.organizations?.[0]?.title }];
            updateFields.push('organizations');
          }
          const result = await papi(token, `/${params.resourceName}:updateContact`, {
            method: 'PATCH', body: person,
            query: { updatePersonFields: updateFields.join(','), personFields: PERSON_FIELDS },
          });
          return jsonResult({ updated: true, contact: mapPerson(result) });
        } catch (e: any) { return errorResult(e.message); }
      },
    },
  ];
}
