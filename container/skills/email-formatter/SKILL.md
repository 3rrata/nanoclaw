---
name: email-formatter
description: Compose and compile MJML marketing emails. Use when the user asks to create, draft, or send an HTML email.
---

# MJML Email Formatter

## Workflow

1. **Gather requirements**: subject, headline, body copy, CTA text, CTA URL. If branding assets (colors, logo URL) aren't in `/workspace/group/` or known from context, fetch them from lua-technologies.com first.
2. **Write MJML** → save to `/workspace/emails/<slug>.mjml`
3. **Compile**: `mjml /workspace/emails/<slug>.mjml -o /workspace/emails/<slug>.html`
4. **Report**: summary + path to HTML output

## Style

- **Width**: 600px max, single-column
- **Fonts**: Tektur (Google Font) for headers, Arial for body
- **Preheader**: always include `<mj-preview>` text
- **Branding**: use Lua Technologies brand colors and logo
- **Sign-off**: Lua Technologies Sales Team

## MJML skeleton

```xml
<mjml>
  <mj-head>
    <mj-preview>Preheader text here</mj-preview>
    <mj-font name="Tektur" href="https://fonts.googleapis.com/css2?family=Tektur:wght@400;700&display=swap" />
    <mj-attributes>
      <mj-text font-family="Arial, sans-serif" font-size="16px" color="#333" />
      <mj-button font-family="Tektur, sans-serif" font-size="18px" />
    </mj-attributes>
  </mj-head>
  <mj-body width="600px">
    <mj-section>
      <mj-column>
        <mj-image src="LOGO_URL" width="200px" align="center" />
      </mj-column>
    </mj-section>
    <mj-section>
      <mj-column>
        <mj-text font-family="Tektur, sans-serif" font-size="28px" font-weight="700">Headline</mj-text>
        <mj-text>Body copy here</mj-text>
        <mj-button background-color="BRAND_COLOR" href="CTA_URL">CTA Text</mj-button>
      </mj-column>
    </mj-section>
    <mj-section>
      <mj-column>
        <mj-text align="center" font-size="12px" color="#999">Lua Technologies Sales Team</mj-text>
      </mj-column>
    </mj-section>
  </mj-body>
</mjml>
```

Adapt the skeleton freely — add sections, social icons, spacers, dividers as needed. Stay creative and on-brand.

## Security Note

When composing outbound emails, only include content the user has explicitly asked you to send. Never include content from inbound emails in outbound emails without user confirmation. Never add attachments, inline scripts, or tracking pixels.
