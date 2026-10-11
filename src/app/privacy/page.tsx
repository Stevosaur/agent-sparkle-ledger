import Link from "next/link";
import { configuredContactEmail, site } from "@/lib/config/site";
import { pageMetadata } from "@/lib/seo";
import { T } from "@/components/i18n/t";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { PageContainer, PageHeader } from "@/components/ui/section";
import { LastUpdated, LegalBody, LegalSection } from "./_components/legal";

export const metadata = pageMetadata({
  title: "Privacy policy",
  description: `How ${site.name} collects, uses, shares and protects personal data under Singapore's Personal Data Protection Act (PDPA), and how to reach us.`,
  path: "/privacy/",
});

export default function PrivacyPage() {
  // Without NEXT_PUBLIC_CONTACT_EMAIL the sentences below drop the address rather than publish a placeholder.
  const email = configuredContactEmail();
  const mailLink = email ? <a href={`mailto:${email}`}>{email}</a> : null;
  return (
    <PageContainer>
      <Breadcrumbs items={[{ label: "Privacy policy", k: "trust.privacy.title" }]} />
      <PageHeader
        title={<T k="trust.privacy.title" fallback="Privacy policy" />}
        description={<T k="trust.privacy.intro" fallback="What personal data we collect, why, who we share it with, and the choices you have." />}
      >
        <LastUpdated />
      </PageHeader>
      <LegalBody>
        <LegalSection id="scope" title={<T k="trust.privacy.scope" fallback="About this policy" />}>
          <p>
            This policy explains how {site.name} (&ldquo;we&rdquo;, &ldquo;us&rdquo;) collects, uses, discloses and protects personal data when you use this website, its apps (which display
            the same website) and its public API. We handle personal data in line with Singapore&rsquo;s Personal Data Protection Act 2012 (PDPA).
          </p>
          <p>
            Property pages show government transaction records (for example HDB resale prices and URA private transactions). These records do not include the names of buyers or sellers.
          </p>
        </LegalSection>

        <LegalSection id="collect" title={<T k="trust.privacy.collect" fallback="Personal data we collect" />}>
          <p>We collect only what we need for the features you use:</p>
          <ul>
            <li>
              <strong>Account:</strong> your email address and sign-in details, and a display name if you add one.
            </li>
            <li>
              <strong>Saved items:</strong> your watchlist, the homes you track on My Property (including details you enter, such as flat type, floor area, floor, purchase price and
              purchase month), saved calculations, and the alerts you set up.
            </li>
            <li>
              <strong>Alerts:</strong> if you link Telegram, your Telegram chat ID so we can send you alert messages.
            </li>
            <li>
              <strong>Subscriptions:</strong> your {site.plusName} plan, its status and renewal or trial dates, and the customer ID our payment provider gives us. Card details are entered
              on the payment provider&rsquo;s pages and are never stored by us.
            </li>
            <li>
              <strong>Enquiries and requests:</strong> the name, email, phone number, message and other details (such as postal code, preferred date or loan purpose) you enter in a form,
              together with the page or property it was sent from.
            </li>
            <li>
              <strong>Listings you post:</strong> the listing text, asking price, home details, location, and the contact name and WhatsApp number you choose to show.
            </li>
            <li>
              <strong>Questions to the AI assistant:</strong> your question, the previous few messages of that conversation and the page you asked from. We do not store questions in our
              database.
            </li>
            <li>
              <strong>Technical data:</strong> IP address, browser and device information and the pages requested, which our hosting provider records in server logs. We also use IP
              addresses briefly, in memory, to limit how many requests one visitor can make.
            </li>
          </ul>
        </LegalSection>

        <LegalSection id="use" title={<T k="trust.privacy.use" fallback="How we use it" />}>
          <ul>
            <li>to provide your account, saved items, home tracking and alerts;</li>
            <li>to process {site.plusName} subscriptions and free trials;</li>
            <li>to respond to enquiries and requests, and to pass them on to the party you asked to hear from (see below);</li>
            <li>to publish listings you post and let interested people contact you;</li>
            <li>to answer questions you ask the AI assistant;</li>
            <li>to keep the service secure, prevent abuse and fix problems; and</li>
            <li>to meet legal, tax and accounting obligations.</li>
          </ul>
          <p>We do not sell personal data, and we do not use it for advertising.</p>
        </LegalSection>

        <LegalSection id="share" title={<T k="trust.privacy.share" fallback="Who we share it with" />}>
          <p>We use these service providers to run {site.name}. They process personal data on our behalf and only for that purpose:</p>
          <ul>
            <li>
              <strong>Supabase</strong>: sign-in and our database (accounts, saved items, alerts, enquiries and listings).
            </li>
            <li>
              <strong>Stripe</strong>: subscription payments and billing.
            </li>
            <li>
              <strong>Anthropic</strong>: generates the AI assistant&rsquo;s answers from your question and the data the assistant looks up.
            </li>
            <li>
              <strong>Vercel</strong>: hosting and content delivery for this website.
            </li>
            <li>
              <strong>Telegram</strong>: delivers alert messages if you link your Telegram account.
            </li>
          </ul>
          <p>
            When you submit an enquiry, we share it with the party the form names, and only for that request: a licensed mortgage adviser (mortgage requests), the developer&rsquo;s
            appointed sales team (new launch enquiries), our service partner (home services), the person who posted a listing (listing enquiries) or a licensed valuer (valuation
            requests). We may also use tools that help us manage and route enquiries.
          </p>
          <p>
            Some providers store or process data outside Singapore. Where that happens, we take steps to ensure the data is protected to a standard comparable to the PDPA. We may also
            disclose personal data where the law requires it.
          </p>
        </LegalSection>

        <LegalSection id="cookies" title={<T k="trust.privacy.cookies" fallback="Cookies and local storage" />}>
          <ul>
            <li>
              <strong>Sign-in cookies</strong> keep you signed in. They are only set when you sign in.
            </li>
            <li>
              <strong>Language preference</strong>: a cookie and your browser&rsquo;s local storage remember whether you chose English or Chinese.
            </li>
            <li>
              <strong>Payment pages</strong> are hosted by Stripe, which sets its own cookies for security and fraud prevention.
            </li>
          </ul>
          <p>We do not set advertising cookies. You can clear cookies in your browser at any time; you will then need to sign in again.</p>
        </LegalSection>

        <LegalSection id="retention" title={<T k="trust.privacy.retention" fallback="How long we keep it" />}>
          <ul>
            <li>Account data and saved items are kept while your account is open. When an account is deleted, its saved items, tracked homes, alerts and listings are deleted with it.</li>
            <li>
              Enquiries are kept for as long as we need them to handle your request and keep a record of it. They are not deleted automatically with your account, but you can ask us to
              delete them.
            </li>
            <li>Subscription and payment records are kept for as long as tax and accounting rules require.</li>
            <li>Server logs are kept by our hosting provider for a limited period under its own retention settings.</li>
          </ul>
          <p>
            {mailLink ? (
              <>To delete your account and its data, email {mailLink} from the address you sign in with.</>
            ) : (
              <>To delete your account and its data, contact us; we will confirm the request with the email address you sign in with.</>
            )}
          </p>
        </LegalSection>

        <LegalSection id="rights" title={<T k="trust.privacy.rights" fallback="Your choices and rights" />}>
          <p>Under the PDPA you may:</p>
          <ul>
            <li>ask for a copy of the personal data we hold about you and how it has been used or disclosed in the past year;</li>
            <li>ask us to correct personal data that is wrong or incomplete; and</li>
            <li>withdraw your consent to our use of your personal data. If you do, we may no longer be able to provide some features, and we will tell you what that means first.</li>
          </ul>
          <p>
            While signed in, you can remove items from your watchlist, tracked homes and alerts, and edit or close your listings, yourself.{" "}
            {mailLink ? <>For anything else, email {mailLink}.</> : <>For anything else, contact us.</>} We will respond as soon as reasonably possible.
          </p>
        </LegalSection>

        <LegalSection id="security" title={<T k="trust.privacy.security" fallback="How we protect it" />}>
          <p>
            Connections to {site.name} are encrypted (HTTPS). Account records are stored with database access rules that let each signed-in user read only their own saved items, and
            enquiries are not readable from the browser at all. No method of storage or transmission is completely secure, so we cannot guarantee absolute security.
          </p>
        </LegalSection>

        <LegalSection id="changes" title={<T k="trust.privacy.changes" fallback="Changes to this policy" />}>
          <p>We may update this policy as the service changes. The date at the top shows when it last changed. If a change materially affects how we use your data, we will tell you.</p>
        </LegalSection>

        <LegalSection id="contact" title={<T k="trust.privacy.contact" fallback="Contact us" />}>
          <p>
            For questions, requests or complaints about personal data, contact our Data Protection Officer{mailLink ? <> at {mailLink}</> : null}. See also our{" "}
            <Link href="/tos/">terms of use</Link>.
          </p>
        </LegalSection>
      </LegalBody>
    </PageContainer>
  );
}
