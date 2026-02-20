# Twilio SMS & Voice

Send SMS messages, make voice calls, and manage phone numbers with Twilio.

## Installation

Install this skill from the AgenticMail skill registry:

```
agenticmail skill install twilio-sms
```

## Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `accountSid` | string | Yes | Twilio Account SID |
| `authToken` | string | Yes | Twilio Auth Token |
| `fromNumber` | string | Yes | Twilio phone number to send from (e.g., +15551234567) |

Example configuration:

```json
{
  "accountSid": "ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx",
  "authToken": "your-twilio-auth-token",
  "fromNumber": "+15551234567"
}
```

## Tools

### Send SMS
- **ID:** `twilio_send_sms`
- **Description:** Send an SMS message to a phone number

### Make Call
- **ID:** `twilio_make_call`
- **Description:** Initiate an outbound voice call

### List Messages
- **ID:** `twilio_list_messages`
- **Description:** List recent SMS messages

## License

MIT
