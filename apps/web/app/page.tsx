import { ApiStatus } from '../components/api-status';

export default function HomePage() {
  // Inlined at build time from next.config.ts (validated, with a local-development default).
  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:4000';

  return (
    <>
      <h1>Sync foundation status</h1>
      <p className="lead">
        This is the engineering foundation of Sync. Membership and club-management features have not
        been built yet.
      </p>

      <ApiStatus apiBaseUrl={apiBaseUrl} />

      <section className="card" aria-labelledby="scope-heading">
        <h2 id="scope-heading">Not available yet</h2>
        <ul>
          <li>Sign-in and staff accounts</li>
          <li>Database and stored data</li>
          <li>Background job processing</li>
          <li>Members, billing, attendance and every other product module</li>
        </ul>
      </section>
    </>
  );
}
