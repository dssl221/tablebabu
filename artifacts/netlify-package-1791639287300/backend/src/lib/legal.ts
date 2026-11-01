export const POLICY_VERSION = "2026-10-10";
export const legalBusiness = {
  name: "TableBabu",
  address: "Raniganj, West Bengal, India",
  email: "debojyotisinha2210@gmail.com",
};
export const legalLinks = [
  ["Privacy", "/legal/privacy"],
  ["Terms", "/legal/terms"],
  ["Cancellations & refunds", "/legal/refunds"],
  ["Cookies", "/legal/cookies"],
  ["Privacy requests & grievances", "/legal/contact"],
] as const;
export const policies: Record<
  string,
  { title: string; sections: [string, string][] }
> = {
  privacy: {
    title: "Privacy notice",
    sections: [
      [
        "Who handles your information",
        "TableBabu provides restaurant menu and ordering software in India. Business contact: Raniganj, West Bengal, India; debojyotisinha2210@gmail.com. Your restaurant handles your food order and payment. TableBabu operates the software and handles owner accounts, platform administration and security. For restaurant order information, contact the restaurant or use our privacy request form so we can route your request. The respective responsibilities must also be reflected in the restaurant's agreement with TableBabu.",
      ],
      [
        "What we collect and why",
        "Guests provide a name or nickname, selected dishes, optional instructions, requests for assistance and a Cash or UPI preference. We use these to identify and fulfil the visit, show order progress, prepare the bill and provide a receipt after the restaurant confirms payment. Owners provide their name, email, password and restaurant details to create and manage their workspace. Passwords are stored as hashes. Platform employee roles and sign-in/sign-out activity support access control and security. Privacy requests collect an email, request type and the information you choose to provide so that we can respond.",
      ],
      [
        "Technical data and storage",
        "Session cookies authenticate the owner or guest. Browser storage holds the cart and retry information for an order. IP addresses and request information are processed for security and abuse prevention. Session tokens are stored as hashes on the server. Order and payment-choice analytics are calculated from restaurant activity. We do not request guest phone numbers, addresses, Aadhaar, card numbers, UPI PINs, passwords for payment apps or OTPs. Do not put sensitive health, financial or identity information in free-text instructions.",
      ],
      [
        "Who can access data",
        "Your restaurant can access its orders and visit records. Authorised platform personnel can access information within their assigned responsibilities. Hosting, database, storage and support providers may process information needed to operate the service. We may disclose information when legally required, to handle a dispute or to protect the service. We do not sell guest information or use it for advertising. The actual hosting locations and provider register must be confirmed with the operator; India-only service availability is not a claim that all infrastructure is located in India.",
      ],
      [
        "How long information is kept",
        "Owner login sessions expire after 12 hours and guest access after 24 hours. These are access limits, not deletion periods. Orders, receipts, subscription payments and administrative records remain stored for service, accounting, dispute and security purposes. There is currently no automatic erasure schedule for those records. You may request erasure; we review what can be removed and explain any applicable retention obligation. The operator must establish and maintain a documented retention schedule, including backup and provider deletion, before a public production rollout.",
      ],
      [
        "Your choices and requests",
        "You can choose to order directly with restaurant staff instead of entering information here. Use Privacy requests & grievances to ask for access, correction, erasure, withdrawal of consent where processing relies on consent, a nomination request or a complaint. Give the restaurant name and order number if relevant. We verify authority proportionately before disclosing or changing records; do not send passwords, session cookies, Aadhaar or payment credentials. Ending browser access does not cancel an order or erase retained financial records. Withdrawal affects future consent-based processing and does not undo earlier lawful processing or independent legal retention duties.",
      ],
      [
        "Children and lawful guardians",
        "Owner accounts are for adults authorised to represent the restaurant. This service does not provide a verified parental or lawful-guardian consent workflow. Children should ask an adult or restaurant staff to place the order, using the adult's own details. Do not enter a child's personal information. Contact us if such information has been entered. This instruction is not an age-verification system.",
      ],
      [
        "Security, incidents and complaints",
        "We use access controls, tenant scoping, validation, secure production cookies and other safeguards described by the service. No service can promise absolute security. Report suspected exposure promptly through our grievance contact. The operator must assess applicable incident reporting and individual-notification duties. We aim to acknowledge complaints within 48 hours and resolve them within 30 days; these are service targets and do not replace applicable statutory timelines or remedies. You retain rights to approach competent authorities under applicable law.",
      ],
      [
        "Changes",
        "This notice is version 2026-10-10. Material changes should be communicated before any new use requiring a fresh notice or consent. No optional marketing, advertising or third-party tracking consent is requested by the current application.",
      ],
    ],
  },
  terms: {
    title: "Terms of service",
    sections: [
      [
        "The service and its operator",
        "TableBabu, business contact Raniganj, West Bengal, India, provides QR menu and restaurant self-ordering software for use in India. Contact debojyotisinha2210@gmail.com. These terms describe use of the software. They do not replace the restaurant's disclosed sale terms, your subscription quotation or rights under applicable law.",
      ],
      [
        "Restaurant and guest responsibilities",
        "Restaurants are responsible for accurate menus, prices, availability, food preparation, hygiene, allergen information, licences and statutory invoices applicable to their business. Guests should verify important dietary requirements directly with staff. TableBabu is not a food delivery service or payment gateway. A guest order is sent to the restaurant for processing; staff should be contacted promptly about errors or cancellations.",
      ],
      [
        "Accounts and permitted use",
        "An owner must be at least 18 and authorised to act for the restaurant, provide accurate account details, protect credentials and promptly report compromise. Do not access another tenant's information, upload unlawful or infringing content, impersonate another person, attempt to bypass access controls, distribute malware or disrupt the service. Use restaurant images and branding only with permission. Owners remain responsible for authorised use of their account.",
      ],
      [
        "Orders and payments",
        "Prices are calculated by the server from the restaurant's menu. Check the order before placing it. Cash or UPI selection records a preference only; payment is collected and verified by restaurant staff. TableBabu does not receive a guest's payment PIN, verify bank settlement or charge the guest online. A downloadable receipt is available after staff marks payment received. The app receipt is informational and is not represented as a GST tax invoice; request the appropriate invoice from the restaurant.",
      ],
      [
        "Subscriptions and suspension",
        "Restaurant subscription amount, term, included services and renewal conditions must be communicated in the agreed quotation before payment. Subscription payment is manually verified and recorded by authorised platform staff. The platform can pause ordering for an expired subscription, non-payment, security concerns or misuse. Contact support to dispute an error. A suspension does not remove legal rights or make customer information public. Do not assume automatic renewal or recurring debits.",
      ],
      [
        "Privacy and restaurant data",
        "Use personal data only for the purposes explained to the person and permitted by law. Owners must provide appropriate restaurant notices and handle order-related rights requests. Processing responsibilities, confidentiality, subprocessors, security, incident cooperation, retention and return/deletion of data require an appropriate written restaurant agreement. The privacy notice describes current application behaviour; it is not a certification of compliance.",
      ],
      [
        "Availability, responsibility and remedies",
        "Maintenance, outages and connectivity may interrupt service. Restaurants should keep a manual ordering and payment process available. No guarantee of uninterrupted service, revenue, regulatory approval or immunity from government action is made. Nothing in these terms excludes non-excludable consumer rights, statutory duties, or remedies for which liability cannot lawfully be limited. Any specific commercial liability allocation must be agreed in the restaurant subscription contract.",
      ],
      [
        "Ending service and disputes",
        "Contact support to stop renewal or request account closure and an appropriate data export. Existing payment obligations and lawful retention requirements may survive closure. Indian law applies, subject to mandatory applicable protections. Contact the grievance channel first where appropriate; these terms do not prevent access to competent courts, consumer forums or regulators. No exclusive court location or mandatory arbitration agreement is imposed here.",
      ],
    ],
  },
  refunds: {
    title: "Cancellations and refunds",
    sections: [
      [
        "Restaurant food orders",
        "Contact restaurant staff immediately to request a change, cancellation or refund. TableBabu does not collect the guest's food payment. The restaurant must communicate its cancellation conditions, review food and billing complaints, and issue any approved refund through the appropriate payment method. Preparation status may affect whether a change is possible. Statutory consumer remedies are not excluded.",
      ],
      [
        "Restaurant subscriptions",
        "Before accepting payment, TableBabu must disclose the subscription price, duration, service scope and any applicable cancellation or refund conditions in writing. To dispute a duplicate payment, an incorrect charge or unavailable contracted service, contact support with the payment date and reference. Never send a UPI PIN, OTP or full bank credentials. Requests require verification; this page does not promise automatic refunds or impose a blanket no-refund rule.",
      ],
      [
        "Stopping renewal",
        "Contact TableBabu before the next agreed renewal if you do not wish to continue. The current product records subscriptions manually and does not initiate recurring bank debits. Account closure and erasure requests are separately reviewed so that unpaid bills, disputes and legally retained records are handled correctly.",
      ],
    ],
  },
  cookies: {
    title: "Cookies and browser storage",
    sections: [
      [
        "Essential session cookies",
        "Owner login cookies keep you signed in for up to 12 hours. Restaurant-specific guest cookies restore the visit for up to 24 hours. In production these cookies use Secure, HttpOnly and SameSite attributes. Logout revokes owner access. Cookie expiry does not delete the associated database records.",
      ],
      [
        "Cart and retry storage",
        "The browser stores cart contents and order-submission retry information, keyed to a visit. This helps recover refreshes and avoid duplicate orders. Local storage can remain after a session expires until it is cleared. On a shared device, clear site data after your visit, after saving any needed receipt. Clearing storage alone does not erase records held by the restaurant.",
      ],
      [
        "Optional tracking",
        "The current application does not install advertising trackers or external behavioural analytics cookies. No accept-all banner is needed for a nonexistent optional tracker. Any future optional processing must be assessed, disclosed and provided with an appropriate choice before activation.",
      ],
    ],
  },
};
