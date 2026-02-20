# Canva Design

Create designs, manage templates, and export assets from Canva. Automate social media graphics.

## Installation

Install this skill from the AgenticMail skill marketplace or add it manually:

```
agenticmail skills install canva-design
```

## Configuration

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `accessToken` | string | Yes | Canva Connect API access token. Generate one from the Canva Developers portal. |
| `brandTemplateId` | string | No | Default brand template ID to use when creating new designs. |

## Tools

### Create Design (`canva_create_design`)
Create a new design from a template.

### Export Design (`canva_export_design`)
Export a design as PNG, PDF, or SVG.

### List Templates (`canva_list_templates`)
List available design templates.

## License

MIT
