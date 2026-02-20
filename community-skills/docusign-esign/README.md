# DocuSign eSignature

Send documents for electronic signature, track envelope status, and manage templates.

## Installation

Install this skill from the AgenticMail skill marketplace or add it manually:

```
agenticmail skills install docusign-esign
```

## Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `integrationKey` | string | Yes | DocuSign integration key (client ID). Found in the DocuSign Admin > API and Keys. |
| `userId` | string | Yes | DocuSign user ID (GUID). Found in the DocuSign Admin > API and Keys under your user. |
| `accountId` | string | Yes | DocuSign account ID (GUID). Found in the DocuSign Admin > API and Keys. |
| `rsaPrivateKey` | string | Yes | RSA private key in PEM format for JWT authentication. Generated when creating the integration key. |

## Tools

### Send Envelope (`docusign_send_envelope`)
Send a document for electronic signature.

### Get Envelope Status (`docusign_get_status`)
Check the status of a sent envelope.

### List Templates (`docusign_list_templates`)
List available signing templates.

## License

MIT
