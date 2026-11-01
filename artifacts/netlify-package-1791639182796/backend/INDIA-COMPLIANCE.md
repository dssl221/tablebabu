# India privacy and legal readiness

Reviewed against available official material on 10 October 2026. This is an implementation record and operational checklist, not legal advice, government approval or a compliance certificate.

## Legal baseline

The intended framework is **DPDP**, not DPSP (Directive Principles of State Policy). The [India Code consolidated DPDP Act](https://www.indiacode.nic.in/bitstream/123456789/22037/1/a2023-22.pdf), commencement footnote, records staggered commencement: specified institutional provisions in November 2025, another group after one year, and most processing obligations after eighteen months. Do not describe all duties as already in force on this review date. The [official PIB announcement](https://www.pib.gov.in/PressReleasePage.aspx?PRID=2190014) also describes phased implementation. Counsel should verify current Gazette notifications/corrigenda and the applicable commencement dates before launch.

[CERT-In's official directions and FAQs](https://www.cert-in.org.in/Directions70B.jsp) require separate assessment: covered organisations must report specified incidents within six hours of noticing or being informed, maintain required ICT logs for 180 days within Indian jurisdiction, and meet time-synchronisation and contact requirements. Applicability and incident categories must be checked; ordinary application errors are not automatically reportable breaches.

Also obtain advice on the IT Act/SPDI framework during transition, consumer protection and e-commerce applicability, contracts, tax invoicing, restaurant food-safety responsibilities, accessibility, employment records and any cross-border providers. DPDP preparation alone does not address every Indian law.

## Implemented in this change

- Public privacy, terms, cancellations/refunds, essential-storage and grievance pages, with the operator-supplied name TableBabu, locality Raniganj, West Bengal, and public mailbox debojyotisinha2210@gmail.com. The locality is not presented as a verified registered-office address.
- Notices beside owner and guest collection. The guest notice explains purpose, restaurant sharing and the manual-ordering alternative. No new advertising or tracking consent banner, since there are no such trackers in the application.
- Owner signup requires an explicit, unchecked adult/authority declaration and acceptance of the current terms version, validated on the server. Version and acceptance time are persisted atomically with new accounts. Legacy users remain null; acceptance is not fabricated or backfilled. This is self-attestation, not verified age assurance or parental consent.
- A public rights/grievance form stores requests and returns an opaque reference without disclosing existing records. It covers access, correction, erasure, withdrawal, nomination and grievances. IP and database-backed email quotas, origin checks, length limits and existing safe logging apply.
- An ADMIN-only request inbox at `/control-room/privacy` with pagination, IST timestamps, resolution notes and optimistic update checks. Owners and platform employees cannot access it. Changing status does not send email, prove identity or execute erasure.
- Existing authentication, tenant isolation and security controls remain in place. Legal routes retain noindex pending review; the existing sitemap remains limited to the indexable homepage.

## Required before public rollout

1. Engage Indian counsel to approve the policies, lawful processing bases, contractual roles, subscription/refund conditions and any applicable statutory disclosures. Verify legal entity name, full service/registered address and appointed grievance contact. Publish necessary business identifiers; do not invent CIN, GSTIN or licences.
2. Appoint an accountable operator for the inbox and monitor it at least daily. The published service targets are acknowledgement within 48 hours and resolution within 30 days, without overriding shorter applicable legal deadlines. There is no email notification worker: the operator must check the inbox and send responses manually from the monitored mailbox.
3. Verify requesters proportionately using existing account/session/order information before disclosure. An email address alone is not proof. Never demand Aadhaar, OTPs, passwords or payment credentials by default. Record verification, restaurant coordination, action and response in resolution notes. For withdrawals, promptly stop the relevant future consent-based processing, revoke access where appropriate and explain independent retention grounds. No automatic erasure, withdrawal engine, identity verification or nomination-verification workflow is implemented.
4. Approve and implement a retention schedule for orders, receipts, free-text notes, employee login history, privacy requests, audit trails, accounts and backups. Access expiry is not erasure. Neither perpetual retention nor blanket deletion is an acceptable substitute for the schedule. Configure legal holds, minimum retention, processor deletion and backup expiry. This change deliberately does not delete existing business records.
5. Agree restaurant processing contracts covering purpose/instructions, confidentiality, subprocessors, breach assistance, rights requests and return/deletion. Complete a provider and transfer register with actual hosting/backup regions. India-only customers do not establish India-only storage.
6. Assess children's data and lawful-guardian requirements. The current notices ask children to use an adult/staff flow; there is no technical age or parental verification. Do not market the app as child-compliant solely because of a notice or owner checkbox. Review accessible notices, language options and any required fresh notice/consent for existing users before the relevant requirements apply.
7. Implement verified operational backups, restoration drills, least-privilege infrastructure access, central restricted audit retention, incident alerting and personnel training. Existing application logs and database rows are not proof of an operationally compliant logging system.

## Incident procedure

- Assign an incident lead, record discovery time in UTC (display IST), contain exposure, preserve evidence, revoke affected credentials and document scope without spreading personal data.
- Immediately assess CERT-In reportability and applicable deadlines with the designated contact; do not wait for a completed forensic investigation where an initial report is due.
- Assess applicable DPDP individual/Board notifications and other duties against the provisions then in force. Keep a notification log and provide follow-ups through official channels. No automated regulator report is implemented.
- Investigate root cause, remediate, verify recovery and review affected restaurant/provider obligations. Test this process before launch.

## Deployment and verification

Run `npm run db:migrate` then `npm run db:generate` before restarting the custom server. The migration adds nullable owner acceptance fields and the PrivacyRequest table with request-type/status constraints. Back up the database before production migration. No existing acceptance or erasure is inferred.

Run typecheck, unit tests, targeted onboarding/privacy browser tests and the production build. This checklist does not certify compliance or guarantee protection from regulatory action.
