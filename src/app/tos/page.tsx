import Link from "next/link";
import { configuredContactEmail, site } from "@/lib/config/site";
import { formatSgd } from "@/lib/format";
import { pageMetadata } from "@/lib/seo";
import { PUBLIC_API_RATE_LIMIT } from "@/lib/api/constants";
import { T } from "@/components/i18n/t";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { PageContainer, PageHeader } from "@/components/ui/section";
import { LastUpdated, LegalBody, LegalSection } from "../privacy/_components/legal";

export const metadata = pageMetadata({
  title: "Terms of use",
  description: `The terms for using ${site.name}: information only, not advice; data accuracy; ${site.plusName} subscriptions, trials and cancellation; acceptable use and the public API.`,
  path: "/tos/",
});

const { monthlyPrice, yearlyPrice, trialDays } = site.plus;

export default function TermsPage() {
  // Without NEXT_PUBLIC_CONTACT_EMAIL the contact section is left out rather than publishing a placeholder.
  const email = configuredContactEmail();
  return (
    <PageContainer>
      <Breadcrumbs items={[{ label: "Terms of use", k: "trust.tos.title" }]} />
      <PageHeader title={<T k="trust.tos.title" fallback="Terms of use" />} description={<T k="trust.tos.intro" fallback="Please read these terms before you use the site, the apps or the public API." />}>
        <LastUpdated />
      </PageHeader>
      <LegalBody>
        <LegalSection id="agreement" title={<T k="trust.tos.agreement" fallback="1. Agreement" />}>
          <p>
            These terms apply to your use of {site.name}, including this website, its apps (which display the same website) and its public API. By using {site.name} you agree to them.
            If you do not agree, please do not use the service. Our <Link href="/privacy/">privacy policy</Link> explains how we handle personal data.
          </p>
        </LegalSection>

        <LegalSection id="not-advice" title={<T k="trust.tos.notAdvice" fallback="2. Information only, not advice" />}>
          <p>
            {site.name} provides general information about Singapore property. Nothing on the site, in the calculators, in rankings or from the AI assistant is financial, investment,
            legal, tax or valuation advice, or a recommendation to buy, sell or rent any property. We are not acting as your financial adviser, lawyer, valuer or estate agent.
          </p>
          <p>
            Property decisions involve significant sums. Before you commit, check eligibility, loan terms, stamp duties and CPF usage with the relevant authorities (such as HDB, IRAS,
            CPF Board and URA), your bank, and licensed professionals.
          </p>
        </LegalSection>

        <LegalSection id="accuracy" title={<T k="trust.tos.accuracy" fallback="3. Data and estimates" />}>
          <p>
            Transaction records come from public government sources and are published as received, with the processing described on our <Link href="/methodology/">methodology</Link>{" "}
            page. Records can be delayed, revised, incomplete or matched to the wrong property, and some datasets may not be available at all times.
          </p>
          <p>
            Valuations, remaining-lease figures, yields, rankings, calculator results and AI answers are estimates produced by automated methods. They can be wrong and are not
            professional valuations. We do not guarantee that any figure is accurate, complete or current, and you rely on it at your own risk.
          </p>
        </LegalSection>

        <LegalSection id="accounts" title={<T k="trust.tos.accounts" fallback="4. Accounts" />}>
          <ul>
            <li>Provide an email address you control, and keep access to it secure. You are responsible for activity on your account.</li>
            <li>Accounts are personal. Do not share an account or create accounts to get around limits.</li>
            <li>We may suspend or close accounts that break these terms or put the service or other users at risk.</li>
          </ul>
        </LegalSection>

        <LegalSection id="subscriptions" title={<T k="trust.tos.subscriptions" fallback="5. Subscriptions, trials and cancellation" />}>
          <ul>
            <li>
              {site.plusName} is an optional paid subscription, currently {formatSgd(monthlyPrice)} a month or {formatSgd(yearlyPrice)} a year. The price you pay is shown at checkout.
              Payments are processed by Stripe.
            </li>
            {trialDays > 0 ? (
              <li>
                First-time subscribers may get a {trialDays}-day free trial. Checkout asks for a card; you are charged when the trial ends unless you cancel before then.
              </li>
            ) : null}
            <li>Subscriptions renew automatically at the end of each billing period, and are charged in advance, until you cancel.</li>
            <li>
              You can cancel at any time from your <Link href="/profile/">profile</Link> (Manage billing). Cancelling stops future renewals; you keep {site.plusName} until the end of the
              period you have paid for. Payments already made are not refunded, except where the law requires.
            </li>
            <li>If we change the price, we will tell you before the new price applies to your subscription, and you can cancel before it does.</li>
            <li>Features included in {site.plusName} may change as we improve the service.</li>
          </ul>
        </LegalSection>

        <LegalSection id="acceptable-use" title={<T k="trust.tos.acceptableUse" fallback="6. Acceptable use" />}>
          <p>You must not:</p>
          <ul>
            <li>copy, scrape or download the site&rsquo;s data in bulk by automated means, other than through the public API within its limits;</li>
            <li>get around sign-in, subscription features, rate limits or other technical restrictions;</li>
            <li>resell or republish the site&rsquo;s data or content as your own product;</li>
            <li>post listings or enquiries that are false, misleading, unlawful or that you are not entitled to make;</li>
            <li>use the AI assistant to generate spam or to try to obtain anything other than help with Singapore property research; or</li>
            <li>interfere with the service, probe it for vulnerabilities without permission, or use it to break the law.</li>
          </ul>
        </LegalSection>

        <LegalSection id="api" title={<T k="trust.tos.api" fallback="7. Public API" />}>
          <ul>
            <li>
              The <Link href="/docs/">public API</Link> is free and read-only. It is limited to {PUBLIC_API_RATE_LIMIT.max} requests per {PUBLIC_API_RATE_LIMIT.windowSec} seconds per IP
              address, and we may change limits to protect the service.
            </li>
            <li>
              Attribute the original data sources as described on the API page (data.gov.sg datasets under the Singapore Open Data Licence; URA data under URA&rsquo;s terms), and do not
              suggest that we or any government agency endorse your product.
            </li>
            <li>The API is provided without any guarantee of availability. We may change, limit or withdraw it, or block clients that misuse it.</li>
          </ul>
        </LegalSection>

        <LegalSection id="content" title={<T k="trust.tos.content" fallback="8. Listings and other content you submit" />}>
          <p>
            You are responsible for listings, messages and other content you submit, and you confirm you have the right to share it. You allow us to host, display and pass it on as
            needed to run the service (for example, showing your listing and sending enquiries to you). We may remove content that breaks these terms.
          </p>
        </LegalSection>

        <LegalSection id="third-parties" title={<T k="trust.tos.thirdParties" fallback="9. Third parties" />}>
          <p>
            If you ask to be put in touch with a mortgage adviser, developer&rsquo;s sales team, service provider, lister or valuer, any arrangement you make is between you and them.
            We are not responsible for their services, advice or conduct, or for websites we link to.
          </p>
        </LegalSection>

        <LegalSection id="ip" title={<T k="trust.tos.ip" fallback="10. Intellectual property" />}>
          <p>
            The site&rsquo;s design, text, software and compiled analysis belong to {site.name} or its licensors. Government data remains subject to its publishers&rsquo; licences and
            terms.
          </p>
        </LegalSection>

        <LegalSection id="liability" title={<T k="trust.tos.liability" fallback="11. Liability" />}>
          <p>
            The service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;. To the fullest extent permitted by law, we are not liable for any loss arising from your use of,
            or reliance on, the service, its data or its estimates, including any decision to buy, sell, rent or finance a property. Nothing in these terms limits liability that cannot
            be limited by law.
          </p>
        </LegalSection>

        <LegalSection id="changes" title={<T k="trust.tos.changes" fallback="12. Changes and governing law" />}>
          <p>
            We may update these terms. The date at the top shows when they last changed; continuing to use the service after a change means you accept the updated terms. These terms are
            governed by the laws of Singapore.
          </p>
        </LegalSection>

        {email ? (
          <LegalSection id="contact" title={<T k="trust.tos.contact" fallback="13. Contact" />}>
            <p>
              Questions about these terms: <a href={`mailto:${email}`}>{email}</a>.
            </p>
          </LegalSection>
        ) : null}
      </LegalBody>
    </PageContainer>
  );
}
