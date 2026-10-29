import { notFound } from 'next/navigation';
import s from './legal.module.css';

// Plain-language drafts. These must be reviewed by counsel before launch (see docs/security.md).
const DOCS: Record<string, { title: string; sections: [string, string][] }> = {
  terms: {
    title: 'Terms of Service',
    sections: [
      ['Eligibility', 'Tavern’s paid marketplace is for users 18 and older. You must provide an accurate date of birth. Accounts found to be underage are suspended.'],
      ['What Tavern is', 'Tavern connects players with independent companions for gaming sessions, coaching and non-romantic social conversation. Romantic, sexual or escort services are prohibited.'],
      ['Coins', 'Coins are a limited licence to use Tavern features. Coins have no cash value, cannot be transferred or exchanged for money, and are refundable only where required by law or under the refund rules below.'],
      ['Bookings and refunds', 'Coins for an order are refunded automatically if the companion declines, does not respond in time, or cancels. Customers may cancel free of charge before the companion accepts. Problems during or shortly after a session can be disputed; our team reviews disputes and may refund in full.'],
      ['Gifts', 'Gifts are final once sent. Approved companions receive a share of eligible gifts as earnings.'],
      ['Companions', 'Companions are independent service providers, approved by Tavern before offering paid services. Tavern keeps a platform fee from each service price. Earnings settle after a hold period and are paid out after review.'],
      ['Prohibited conduct', 'No account sharing or asking for game passwords, no off-platform payments, no harassment, cheating, scams or impersonation. Violations can lead to suspension.'],
      ['Suspension and appeals', 'We may restrict accounts that break these terms. You can appeal by contacting support; a different moderator reviews appeals.'],
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    sections: [
      ['What we collect', 'Account details (email, username, date of birth), profile content you add, orders, messages, voice-room participation metadata, wallet and payment records, and device push tokens if you enable notifications.'],
      ['What we do not collect', 'We never ask for game account passwords. Card and e-wallet details are handled by our payment provider; Tavern stores only payment references and status.'],
      ['Voice', 'Voice rooms are live audio through our voice provider. Tavern does not record voice rooms.'],
      ['Why we use it', 'To run bookings and payments, keep the community safe, prevent fraud, and meet legal obligations under the Philippine Data Privacy Act of 2012.'],
      ['Sharing', 'With service providers that run Tavern (hosting, payments, voice, email, push) under contract, and with authorities when legally required.'],
      ['Retention', 'Financial records are kept as required for accounting. Room chat expires after 7 days; notifications after 180 days.'],
      ['Your rights', 'You can access, correct or request deletion of your data by contacting support, subject to records we must legally keep.'],
    ],
  },
  guidelines: {
    title: 'Community Guidelines',
    sections: [
      ['Be kind', 'No harassment, hate speech, threats or bullying — in chat, voice or reviews.'],
      ['Keep it about gaming', 'Paid services are for gaming, coaching and friendly, non-romantic conversation. No sexual content or requests.'],
      ['Protect accounts', 'Never share or request game account credentials. Companions must play on their own accounts.'],
      ['Stay on Tavern', 'Keep payments inside Tavern. Off-platform payment requests are a common scam — report them.'],
      ['Fair play', 'No cheating, exploits, boosting with third-party tools or match fixing.'],
      ['Report and block', 'Use Report and Block on any profile, message or room. Moderators review reports and can warn, suspend or close rooms.'],
    ],
  },
};

export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const doc = DOCS[slug];
  if (!doc) notFound();
  return (
    <article className={s.doc}>
      <p className="tv-label">Draft for review · Tavern Philippines</p>
      <h1 className={s.title}>{doc.title}</h1>
      <div className={s.sections}>
        {doc.sections.map(([h, body], i) => (
          <section key={h} className={s.section}>
            <span className={s.num} aria-hidden>{String(i + 1).padStart(2, '0')}</span>
            <div>
              <h2 className={s.h}>{h}</h2>
              <p className={s.body}>{body}</p>
            </div>
          </section>
        ))}
      </div>
    </article>
  );
}

export function generateStaticParams() {
  return Object.keys(DOCS).map((slug) => ({ slug }));
}
