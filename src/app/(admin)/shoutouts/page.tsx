import { getShoutouts, getShoutoutUrl } from './actions';
import ShoutoutsContent from './ShoutoutsContent';

export const dynamic = 'force-dynamic';

export default async function ShoutoutsPage() {
  const [shoutouts, shoutoutUrl] = await Promise.all([
    getShoutouts(),
    getShoutoutUrl(),
  ]);

  return (
    <div className="shoutouts-page">
      <h1 className="page-title">Shoutouts</h1>
      <ShoutoutsContent 
        initialShoutouts={shoutouts} 
        shoutoutUrl={shoutoutUrl} 
      />
    </div>
  );
}
