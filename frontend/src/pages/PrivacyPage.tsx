import { ArrowLeft, ExternalLink, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router-dom'
import { BrandMark } from '../components/BrandMark'

export function PrivacyPage() {
  return (
    <div className="legal-shell">
      <a className="skip-link" href="#privacy-content">Skip to privacy policy</a>
      <header className="legal-header"><Link to="/"><BrandMark compact /><strong>Mosaic</strong></Link><span>Privacy</span></header>
      <main className="legal-page" id="privacy-content" tabIndex={-1}>
        <Link className="back-link" to="/"><ArrowLeft size={16} /> Back to Mosaic</Link>
        <div className="legal-title"><ShieldCheck size={28} /><span className="eyebrow">PRIVACY POLICY</span><h1>Your data, in plain language.</h1><p>Effective September 18, 2026 · This policy describes the current educational Mosaic deployment.</p></div>

        <section className="legal-section"><h2>What Mosaic stores</h2><p>When you create an account, Mosaic stores your name, email address, username, a password hash and salt, profile bio, and profile image URL. It also stores the content you choose to create or interact with, including collections, saved images and source links, notes, tags, follows, likes, comments, direct messages, collaboration activity, notifications, and sharing settings.</p><p>Mosaic does not store your plaintext password. Session cookies are stored as hashed server-side tokens.</p></section>

        <section className="legal-section"><h2>How that data is used</h2><p>The data is used to sign you in, save and organize your collections, enable collaboration and messaging, show social activity, personalize recommendations from your saved interests, and enforce collection privacy and permissions. Mosaic keeps first-party aggregate counts for shared-collection views and copies; it does not use advertising or third-party analytics SDKs, and Mosaic does not sell personal information.</p></section>

        <section className="legal-section"><h2>What other people can see</h2><p>Your public profile can show your name, username, bio, avatar, follower counts, and collections you make visible. Public collections and pins can be viewed by other people and may be shared through public links. Followers-only content is limited to eligible followers; private collections are limited to you and collaborators you authorize. Direct messages are visible only to the participants in that conversation.</p></section>

        <section className="legal-section"><h2>Cookies and local storage</h2><p>Mosaic uses an essential session cookie to keep you signed in and a random HTTP-only visitor token to count unique visits to shared collections without storing a raw IP address. Both use SameSite protection and are marked Secure in production; the session expires after seven days and the share token after one year. The browser also stores small local preferences such as whether you finished the quick tour and your most recently used collection for quick saves. There are no advertising cookies in this build.</p></section>

        <section className="legal-section"><h2>External services</h2><p>Mosaic currently runs on Render infrastructure. Image discovery can use Pixabay and Wikimedia Commons, so image requests and source visits may be handled by those services. If direct image upload is enabled, uploads are sent from your browser to Cloudinary. If email verification is enabled, Mosaic sends your signup email address to Resend to deliver the one-time verification code. Those providers may process network information such as your IP address according to their own policies. Mosaic does not send your account password to those providers. Deleting your Mosaic account removes the app’s references to uploaded files, but provider-hosted copies may remain under Cloudinary’s retention practices; contact us if you need help requesting provider-side removal.</p></section>

        <section className="legal-section"><h2>Retention and security</h2><p>Account and collection data remains in the application database until it is deleted or the deployment is reset. Removed pins are kept in a temporary undo snapshot for about ten minutes before cleanup. Mosaic uses access controls, hashed passwords and session tokens, input validation, HTTPS-only image URLs, security headers, a Content Security Policy, rate limits, and permission checks to reduce unauthorized access and browser injection risks. No internet service can guarantee absolute security.</p></section>

        <section className="legal-section"><h2>Your choices</h2><p>You control whether collections are private, followers-only, or public, and you can revoke sharing links and collaborator access. You can permanently delete your account from Edit profile after confirming your password. This removes your Mosaic account, your owned collections, and account-linked database records; collections you only collaborate on remain with their owners. To ask a privacy question or request help with deletion, email <a href="mailto:ethan.b.chen@vanderbilt.edu">ethan.b.chen@vanderbilt.edu</a>.</p></section>

        <section className="legal-section"><h2>Changes to this policy</h2><p>If the app begins collecting materially different data or adds new third-party services, this policy should be updated with a new effective date. The source for this educational project is available on GitHub.</p><a className="legal-external" href="https://github.com/EthanChenHyland/Fall2026-CodingChallenge" target="_blank" rel="noopener noreferrer">View project source <ExternalLink size={14} /></a></section>
      </main>
    </div>
  )
}
