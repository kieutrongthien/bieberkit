---
'@bieberkit/mail': minor
---

Add the mail. `@bieberkit/mail` gets `createMailer` (a job `mail.send` and `over(queue)` for `send`, `sendNow` and `verify`), the check of a message (addresses, names, the subject, the size, no header injection), the `log` and memory transports, `@bieberkit/mail/nodemailer` (the SMTP transport and `createMailerFromConfig` for `MAIL_DRIVER`, with a refusal of a plain SMTP URL in production) and `@bieberkit/mail/testing` with a fake SMTP server.
