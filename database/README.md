# MySQL Setup

Docker loads:

1. `database/schema.sql`
2. `database/full_data.sql`

`full_data.sql` contains sanitized demo users and decoy metadata for files, scan results, findings, repair jobs, app settings, user settings, and action logs. It does not include personal accounts or uploaded file bytes.

The default upload policy allows only: `png`, `jpg`, `jpeg`, `pdf`, `zip`, `rar`, and `7z`.

Uploaded file access is set to 24 hours by default. Admins can change it to 5 minutes, 24 hours, or 3 days from the File policies tab.

For manual MySQL setup:

```bash
mysql -u root -p < database/schema.sql
mysql -u root -p cfdmt_web < database/full_data.sql
```

Demo login:

- Email: `decoy.admin@cfdmt.test`
- Password: `password`
