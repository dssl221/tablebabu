# India privacy and legal readiness

Reviewed against available official material on 13 October 2026. This is an implementation record and operational checklist, not legal advice, government approval or a compliance certificate. Business disclosures and hosting remain undecided, as confirmed by the operator on this review date. Public rollout is not cleared by this document.

## Business-specific scope and October review

TableBabu provides restaurant software, not delivery, payment settlement or a registered Consent Manager service. Map responsibility per processing activity: restaurants determine food-order purposes; TableBabu processes their operational data under agreed instructions and independently determines purposes for its own accounts, subscriptions, platform staff and security. Contracts must reflect actual practice. Small size is not a blanket exemption. No Significant Data Fiduciary designation has been established in this review; do not impose that role's DPO/audit programme on the basis of the word “SaaS” alone.

The [official commencement notification](https://www.meity.gov.in/static/uploads/2025/11/c56ceae6c383460ca69577428d36828b.pdf) places the principal processing duties in the eighteen-month group, not in force as of this review. The [final Rules](https://www.meity.gov.in/static/uploads/2025/11/53450e6e5dc0bfa85ebd78686cadad39.pdf), read with the December corrigendum, likewise stage commencement. Plan readiness for May 2027 and verify the precise operative date before relying on it. The [October 2026 order](https://www.meity.gov.in/static/uploads/2026/10/daf495a7b5798a3dfa72a944b51fc176.pdf) corrects language in sections 9 and 10; it does not create a general startup exemption.

The existing IT/SPDI framework remains a separate current assessment, including account passwords, privacy notices, security and grievance handling: [official 2011 Rules](https://indiacode.gov.in/server/api/core/bitstreams/e9545daf-b012-49cd-a697-388039b9b7e0/content). A future DPDP commencement date is not permission to ignore present privacy/security duties.

### Necessary application improvements now implemented

- Privacy requests cannot be marked resolved by a note alone: the administrator records acknowledgement, verification/authority assessment, action and response sent. These are operator attestations, not automated identity verification or email delivery.
- Updates and administrator history commit together, with version checks preventing stale overwrites. No API edits/deletes handling history; database operators still require independent controls. The UI displays the ten latest actions; the database retains all. Existing records are not backfilled with invented evidence.
- The inbox shows the published 48-hour acknowledgement and 30-day response targets in IST. UTC remains the database time basis. Staff must monitor the inbox; there is no background reminder service.
- A cookie-authenticated visit JSON export exposes only the current restaurant visit, order snapshots and service requests. No tokens, hashes, internal IDs or raw receipt HTML are exported. Expired access requires the existing verified-request channel. This convenience is not a complete response to every statutory access request.
- No Aadhaar collection, advertising consent banner, Consent Manager registration feature, automated regulator submission or automatic financial-record erasure was added.

### Minimum operations before real customer rollout

| Requirement | Required action / current status |
| --- | --- |
| Public accountability | Full postal address, actual operator identity and named grievance contact remain undecided. Existing locality/mailbox must not be described as a verified registered office or appointed officer. |
| Provider contracts | Hosting, database and backups are undecided. Record each processor, purpose, region, access and deletion terms; execute restaurant processing terms. |
| Retention | Approve a record-by-record schedule and legal-hold process with accounting/legal review. No blanket immediate deletion or indefinite retention. The code still has no automatic erasure worker. |
| Safeguards | Verify HTTPS, restricted database/storage access, encrypted backups, restore drill, central access logs and incident monitoring on the actual host. Local tests cannot establish these. |
| Rights handling | Assign a daily inbox operator. Verify proportionately; execute correction/erasure/withdrawal with the restaurant and providers; record retained fields and legal grounds; actually send the response. Nomination needs authority checks. |
| Children / guardians | Adult/staff ordering using their own details is the intended flow. Current notices are not age assurance or verifiable parental/guardian consent. Assess this before opening self-service to children or covered guardianship cases. |
| Notice accessibility | Validate notices with the intended audience and prepare required language options before consent-based DPDP duties commence. English-only notices are not represented as complete language compliance. |
| AI menu import | Not activated by this work. Before activation, disclose the chosen AI processor/regions, limit uploads to menu content, remove unnecessary personal data, and verify provider retention/contract terms. No customer orders should be sent for menu OCR. |

For the future DPDP phase, Rules 6 and 8(3) require assessment of one-year security/processing retention and erasure afterwards unless another law requires retention; do not build a short purge that conflicts with them. Rule 7 requires prompt breach notices and a Board update within 72 hours. These differ from CERT-In's existing six-hour incident process. Rule 14's grievance ceiling does not replace TableBabu's shorter published targets. These duties require operational execution, not merely UI labels.

## Legal baseline

The intended framework is **DPDP**, not DPSP (Directive Principles of State Policy). The [India Code consolidated DPDP Act](https://www.indiacode.nic.in/bitstream/123456789/22037/1/a2023-22.pdf), commencement footnote, records staggered commencement: specified institutional provisions in November 2025, another group after one year, and most processing obligations after eighteen months. Do not describe all duties as already in force on this review date. The [official PIB announcement](https://www.pib.gov.in/PressReleasePage.aspx?PRID=2190014) also describes phased implementation. Counsel should verify current Gazette notifications/corrigenda and the applicable commencement dates before launch.

[CERT-In's official directions and FAQs](https://www.cert-in.org.in/Directions70B.jsp) require separate assessment: covered organisations must report specified incidents within six hours of noticing or being informed, maintain required ICT logs for 180 days within Indian jurisdiction, and meet time-synchronisation and contact requirements. Applicability and incident categories must be checked; ordinary application errors are not automatically reportable breaches.

Also obtain advice on the IT Act/SPDI framework during transition, consumer protection and e-commerce applicability, contracts, tax invoicing, restaurant food-safety responsibilities, accessibility, employment records and any cross-border providers. DPDP preparation alone does not address every Indian law.

## Implemented in this change

- Public privacy, terms, cancellations/refunds, essential-storage and grievance pages, with the operator-supplied name TableBabu, locality Raniganj, West Bengal, and public mailbox debojyotisinha2210@gmail.com. The locality is not presented as a verified registered-office address.
- Notices beside owner and guest collection. The guest notice explains purpose, restaurant sharing and the manual-ordering alternative. No new advertising or tracking consent banner, since there are no such trackers in the application.
- Owner signup requires an explicit, unchecked adult/authority declaration and acceptance of the current terms version, validated on the server. Version and acceptance time are persisted atomically with new accounts. Legacy users remain null; acceptance is not fabricated or backfilled. This is self-attestation, not verified age assurance or parental consent.
- A public rights/grievance form stores requests and returns an opaque reference without disclosing existing records. It covers access, correction, erasure, withdrawal, nomination and grievances. IP and database-backed email quotas, origin checks, length limits and existing safe logging apply.
- An ADMIN-only request inbox at `/control-room/privacy` with pagination, IST timestamps, structured handling notes, transactional history and optimistic update checks. Owners and platform employees cannot access it. Changing status does not send email, prove identity or execute erasure.
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

Run `npm run db:migrate` then `npm run db:generate` before restarting the custom server. Earlier migrations added nullable owner acceptance fields and the PrivacyRequest table. The 20261013000000_privacy_workflow migration adds acknowledgement, verification/response fields and PrivacyRequestAction history. Back up the database before production migration. No existing acceptance or erasure is inferred.

Run typecheck, unit tests, targeted onboarding/privacy browser tests and the production build. This checklist does not certify compliance or guarantee protection from regulatory action.

### Verification recorded on 13 October 2026

- Additive privacy-workflow migration applied to the local development database; Prisma client regenerated.
- TypeScript check and production build passed.
- All 39 unit tests passed, including resolution prerequisites and UTC deadline calculations.
- Both targeted privacy browser tests passed: private/admin-only request handling, invalid and stale updates, transactional history, public form, and authenticated visit export with credential exclusion and expiry/tenant checks.
- No production deployment, operational email delivery, backup restoration, external processor contract, identity verification or regulatory certification was tested or claimed.
