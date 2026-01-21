'use client';

import { RecipientData } from './actions';

type Props = {
  recipients: RecipientData[];
};

export default function RecipientsTable({ recipients }: Props) {
  if (recipients.length === 0) {
    return (
      <div className="empty-state">
        No recipients yet. Add one to get started.
      </div>
    );
  }

  return (
    <div className="table-container">
      <table className="recipients-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {recipients.map((recipient) => (
            <tr key={recipient.id}>
              <td>{recipient.name}</td>
              <td>{recipient.email}</td>
              <td>
                <span className={`status-badge ${recipient.active ? 'active' : 'inactive'}`}>
                  {recipient.active ? 'Active' : 'Inactive'}
                </span>
              </td>
              <td>
                <div className="actions-cell">
                  <button className="action-button edit">Edit</button>
                  <button className="action-button delete">Delete</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
