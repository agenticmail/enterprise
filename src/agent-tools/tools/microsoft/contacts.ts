/**
 * Microsoft Outlook Contacts (People) Tools
 *
 * Contact management via Microsoft Graph API.
 */

import type { AnyAgentTool, ToolCreationOptions } from '../../types.js';
import { jsonResult, errorResult } from '../../common.js';
import type { MicrosoftToolsConfig } from './index.js';
import { graph } from './graph-api.js';

export function createOutlookContactsTools(config: MicrosoftToolsConfig, _options?: ToolCreationOptions): AnyAgentTool[] {
  const tp = config.tokenProvider;

  return [
    {
      name: 'outlook_contacts_list',
      description: 'List contacts from the Outlook address book.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          maxResults: { type: 'number', description: 'Max contacts (default: 50)' },
          search: { type: 'string', description: 'Search by name or email' },
        },
        required: [],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const query: Record<string, string> = {
            '$top': String(params.maxResults || 50),
            '$select': 'id,displayName,givenName,surname,emailAddresses,mobilePhone,businessPhones,companyName,jobTitle',
            '$orderby': 'displayName',
          };
          if (params.search) query['$filter'] = `startswith(displayName,'${params.search}') or startswith(givenName,'${params.search}') or startswith(surname,'${params.search}')`;
          const data = await graph(token, '/me/contacts', { query });
          const contacts = (data.value || []).map((c: any) => ({
            id: c.id,
            name: c.displayName,
            firstName: c.givenName,
            lastName: c.surname,
            emails: c.emailAddresses?.map((e: any) => e.address),
            mobile: c.mobilePhone,
            phones: c.businessPhones,
            company: c.companyName,
            jobTitle: c.jobTitle,
          }));
          return jsonResult({ contacts, count: contacts.length });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'outlook_contacts_create',
      description: 'Create a new contact in Outlook.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          firstName: { type: 'string', description: 'First name' },
          lastName: { type: 'string', description: 'Last name' },
          email: { type: 'string', description: 'Email address' },
          mobile: { type: 'string', description: 'Mobile phone number' },
          company: { type: 'string', description: 'Company name' },
          jobTitle: { type: 'string', description: 'Job title' },
          notes: { type: 'string', description: 'Personal notes' },
        },
        required: ['firstName', 'email'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const contact: any = {
            givenName: params.firstName,
            emailAddresses: [{ address: params.email, name: `${params.firstName} ${params.lastName || ''}`.trim() }],
          };
          if (params.lastName) contact.surname = params.lastName;
          if (params.mobile) contact.mobilePhone = params.mobile;
          if (params.company) contact.companyName = params.company;
          if (params.jobTitle) contact.jobTitle = params.jobTitle;
          if (params.notes) contact.personalNotes = params.notes;
          const created = await graph(token, '/me/contacts', { method: 'POST', body: contact });
          return jsonResult({ id: created.id, name: created.displayName, email: params.email });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'outlook_contacts_update',
      description: 'Update an existing contact.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          contactId: { type: 'string', description: 'Contact ID' },
          firstName: { type: 'string', description: 'First name' },
          lastName: { type: 'string', description: 'Last name' },
          email: { type: 'string', description: 'Email address' },
          mobile: { type: 'string', description: 'Mobile phone' },
          company: { type: 'string', description: 'Company name' },
          jobTitle: { type: 'string', description: 'Job title' },
        },
        required: ['contactId'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const update: any = {};
          if (params.firstName) update.givenName = params.firstName;
          if (params.lastName) update.surname = params.lastName;
          if (params.email) update.emailAddresses = [{ address: params.email }];
          if (params.mobile) update.mobilePhone = params.mobile;
          if (params.company) update.companyName = params.company;
          if (params.jobTitle) update.jobTitle = params.jobTitle;
          await graph(token, `/me/contacts/${params.contactId}`, { method: 'PATCH', body: update });
          return jsonResult({ updated: true, contactId: params.contactId });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'outlook_contacts_delete',
      description: 'Delete a contact from Outlook.',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          contactId: { type: 'string', description: 'Contact ID to delete' },
        },
        required: ['contactId'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          await graph(token, `/me/contacts/${params.contactId}`, { method: 'DELETE' });
          return jsonResult({ deleted: true, contactId: params.contactId });
        } catch (e: any) { return errorResult(e.message); }
      },
    },

    {
      name: 'outlook_people_search',
      description: 'Search for people relevant to the user (contacts, colleagues, recent correspondents).',
      category: 'utility' as const,
      parameters: {
        type: 'object' as const,
        properties: {
          query: { type: 'string', description: 'Search query (name or email)' },
          maxResults: { type: 'number', description: 'Max results (default: 10)' },
        },
        required: ['query'],
      },
      async execute(_id: string, params: any) {
        try {
          const token = await tp.getAccessToken();
          const data = await graph(token, '/me/people', {
            query: {
              '$search': `"${params.query}"`,
              '$top': String(params.maxResults || 10),
              '$select': 'id,displayName,givenName,surname,emailAddresses,companyName,jobTitle,department',
            }
          });
          const people = (data.value || []).map((p: any) => ({
            id: p.id, name: p.displayName,
            firstName: p.givenName, lastName: p.surname,
            emails: p.emailAddresses?.map((e: any) => e.address),
            company: p.companyName, jobTitle: p.jobTitle,
            department: p.department,
          }));
          return jsonResult({ people, count: people.length });
        } catch (e: any) { return errorResult(e.message); }
      },
    },
  ];
}
