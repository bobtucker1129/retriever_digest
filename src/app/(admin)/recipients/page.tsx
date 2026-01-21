import { getRecipients } from './actions';
import RecipientsTable from './RecipientsTable';

export const dynamic = 'force-dynamic';

export default async function RecipientsPage() {
  const recipients = await getRecipients();

  return (
    <div className="recipients-page">
      <h1 className="page-title">Recipients</h1>
      <RecipientsTable initialRecipients={recipients} />
    </div>
  );
}
