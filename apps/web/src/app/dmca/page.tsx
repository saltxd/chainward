import { PressShell, Masthead, PressDateline, Colophon } from '@/components/press';

// DMCA / copyright takedown policy and designated-agent notice. To get the safe
// harbor, the designated agent must ALSO be registered with the U.S. Copyright
// Office (dmca.copyright.gov, about $6). Fill the [[DMCA AGENT ...]] and
// [[MAILING ADDRESS]] placeholders with the real registered agent before relying
// on this. Review with counsel.

const TITLE = 'Copyright and DMCA Policy';
const UPDATED = 'October 28, 2026';

export const metadata = {
  title: TITLE,
  description: 'How to report copyright infringement to ChainWard, and our designated agent.',
  alternates: { canonical: 'https://chainward.ai/dmca' },
  robots: { index: true, follow: true },
};

export default function DmcaPage() {
  return (
    <PressShell>
      <PressDateline />
      <div className="press-wrap">
        <Masthead />
        <article className="da">
          <header className="da-header press-measure">
            <div className="press-fileno">Legal</div>
            <h1 className="da-title press-display">Copyright and DMCA Policy</h1>
            <p className="da-sub">Last updated {UPDATED}.</p>
          </header>
          <div className="da-body press-measure">
            <div className="decode-prose">
              <p>
                ChainWard (operated by [[LEGAL ENTITY NAME]]) respects copyright. If you believe material on chainward.ai
                infringes a copyright you own or control, send a notice to our designated agent with the details below. We
                respond to valid notices under the U.S. Digital Millennium Copyright Act (DMCA).
              </p>

              <h2>How to send a takedown notice</h2>
              <p>Your written notice must include:</p>
              <ul>
                <li>Your physical or electronic signature.</li>
                <li>Identification of the copyrighted work you say was infringed.</li>
                <li>The URL or enough detail to let us find the material you want removed.</li>
                <li>Your name, address, phone number, and email.</li>
                <li>
                  A statement that you have a good-faith belief the use is not authorized by the owner, its agent, or the
                  law.
                </li>
                <li>
                  A statement, under penalty of perjury, that the information is accurate and that you are the owner or
                  authorized to act for the owner.
                </li>
              </ul>

              <h2>Designated agent</h2>
              <p>
                Send notices to our DMCA designated agent:
              </p>
              <p className="mono">
                [[DMCA AGENT NAME]]
                <br />
                [[DMCA AGENT MAILING ADDRESS]]
                <br />
                dmca@chainward.ai
              </p>

              <h2>Counter-notice</h2>
              <p>
                If your material was removed and you believe that was a mistake or misidentification, you may send a
                counter-notice to the same agent. It must include your signature, identification of the removed material and
                where it appeared, a statement under penalty of perjury that you have a good-faith belief it was removed by
                mistake, your name, address, and phone number, and your consent to the jurisdiction of the federal court for
                your district (or, if outside the U.S., any district where we may be found) and to accept service from the
                person who filed the notice.
              </p>

              <h2>Repeat infringers</h2>
              <p>
                We may remove material and restrict or end access for anyone we find to be a repeat infringer.
              </p>
            </div>
          </div>
        </article>
        <Colophon />
      </div>
    </PressShell>
  );
}
