'use client';

import { useState } from 'react';
import { RecipientData, addRecipient, updateRecipient, deleteRecipient, toggleRecipientActive } from './actions';

type Props = {
  initialRecipients: RecipientData[];
};

function formatBirthdayDisplay(birthday: string | null): string {
  if (!birthday) return '—';
  const [month, day] = birthday.split('-');
  const date = new Date(2000, parseInt(month) - 1, parseInt(day));
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function RecipientsTable({ initialRecipients }: Props) {
  const [recipients, setRecipients] = useState<RecipientData[]>(initialRecipients);
  const [showModal, setShowModal] = useState(false);
  const [editingRecipient, setEditingRecipient] = useState<RecipientData | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [birthday, setBirthday] = useState('');
  const [optOutDigest, setOptOutDigest] = useState(false);
  const [optOutBirthday, setOptOutBirthday] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingRecipient, setDeletingRecipient] = useState<RecipientData | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleOpenModal = () => {
    setEditingRecipient(null);
    setName('');
    setEmail('');
    setBirthday('');
    setOptOutDigest(false);
    setOptOutBirthday(false);
    setError('');
    setShowModal(true);
  };

  const handleOpenEditModal = (recipient: RecipientData) => {
    setEditingRecipient(recipient);
    setName(recipient.name);
    setEmail(recipient.email);
    setBirthday(recipient.birthday || '');
    setOptOutDigest(recipient.optOutDigest);
    setOptOutBirthday(recipient.optOutBirthday);
    setError('');
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingRecipient(null);
    setName('');
    setEmail('');
    setBirthday('');
    setOptOutDigest(false);
    setOptOutBirthday(false);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!name.trim()) {
      setError('Name is required');
      return;
    }

    if (!validateEmail(email)) {
      setError('Please enter a valid email address');
      return;
    }

    setIsSubmitting(true);

    if (editingRecipient) {
      const result = await updateRecipient(editingRecipient.id, name, email, birthday || undefined, optOutDigest, optOutBirthday);
      setIsSubmitting(false);

      if (result.success && result.recipient) {
        const updatedRecipients = recipients.map((r) =>
          r.id === editingRecipient.id ? result.recipient! : r
        ).sort((a, b) => a.name.localeCompare(b.name));
        setRecipients(updatedRecipients);
        handleCloseModal();
        setSuccessMessage('Recipient updated');
        setTimeout(() => setSuccessMessage(''), 3000);
      } else {
        setError(result.error || 'Failed to update recipient');
      }
    } else {
      const result = await addRecipient(name, email, birthday || undefined, optOutDigest, optOutBirthday);
      setIsSubmitting(false);

      if (result.success && result.recipient) {
        const newRecipients = [...recipients, result.recipient].sort((a, b) =>
          a.name.localeCompare(b.name)
        );
        setRecipients(newRecipients);
        handleCloseModal();
        setSuccessMessage('Recipient added');
        setTimeout(() => setSuccessMessage(''), 3000);
      } else {
        setError(result.error || 'Failed to add recipient');
      }
    }
  };

  const handleDeleteClick = (recipient: RecipientData) => {
    setDeletingRecipient(recipient);
  };

  const handleCancelDelete = () => {
    setDeletingRecipient(null);
  };

  const handleConfirmDelete = async () => {
    if (!deletingRecipient) return;

    setIsDeleting(true);
    const result = await deleteRecipient(deletingRecipient.id);
    setIsDeleting(false);

    if (result.success) {
      setRecipients(recipients.filter((r) => r.id !== deletingRecipient.id));
      setDeletingRecipient(null);
      setSuccessMessage('Recipient deleted');
      setTimeout(() => setSuccessMessage(''), 3000);
    } else {
      setError(result.error || 'Failed to delete recipient');
      setDeletingRecipient(null);
    }
  };

  const handleToggleActive = async (recipient: RecipientData) => {
    setTogglingId(recipient.id);
    const result = await toggleRecipientActive(recipient.id);
    setTogglingId(null);

    if (result.success && result.active !== undefined) {
      setRecipients(recipients.map((r) =>
        r.id === recipient.id ? { ...r, active: result.active! } : r
      ));
    } else {
      setError(result.error || 'Failed to toggle status');
      setTimeout(() => setError(''), 3000);
    }
  };

  return (
    <>
      <div className="recipients-header">
        <button className="add-recipient-button" onClick={handleOpenModal}>
          Add Recipient
        </button>
        {successMessage && <span className="success-message">{successMessage}</span>}
      </div>

      {recipients.length === 0 ? (
        <div className="empty-state">
          No recipients yet. Add one to get started.
        </div>
      ) : (
        <div className="table-container">
          <table className="recipients-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Birthday</th>
                <th>Status</th>
                <th>Flags</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {recipients.map((recipient) => (
                <tr key={recipient.id}>
                  <td>{recipient.name}</td>
                  <td>{recipient.email}</td>
                  <td style={{ color: recipient.birthday ? '#374151' : '#9ca3af', fontSize: '13px' }}>
                    {formatBirthdayDisplay(recipient.birthday)}
                  </td>
                  <td>
                    <button
                      className={`status-toggle ${recipient.active ? 'active' : 'inactive'} ${togglingId === recipient.id ? 'toggling' : ''}`}
                      onClick={() => handleToggleActive(recipient)}
                      disabled={togglingId === recipient.id}
                      title={recipient.active ? 'Click to deactivate' : 'Click to activate'}
                    >
                      <span className="toggle-track">
                        <span className="toggle-thumb" />
                      </span>
                      <span className="toggle-label">{recipient.active ? 'Active' : 'Inactive'}</span>
                    </button>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {recipient.optOutDigest && (
                        <span style={{ fontSize: '11px', background: '#fef2f2', color: '#b91c1c', padding: '2px 6px', borderRadius: '4px', whiteSpace: 'nowrap' }}>
                          No Digest
                        </span>
                      )}
                      {recipient.optOutBirthday && (
                        <span style={{ fontSize: '11px', background: '#fef9c3', color: '#854d0e', padding: '2px 6px', borderRadius: '4px', whiteSpace: 'nowrap' }}>
                          No Bday
                        </span>
                      )}
                      {!recipient.optOutDigest && !recipient.optOutBirthday && (
                        <span style={{ fontSize: '11px', color: '#9ca3af' }}>—</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <div className="actions-cell">
                      <button className="action-button edit" onClick={() => handleOpenEditModal(recipient)}>Edit</button>
                      <button className="action-button delete" onClick={() => handleDeleteClick(recipient)}>Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">{editingRecipient ? 'Edit Recipient' : 'Add Recipient'}</h2>
            <form onSubmit={handleSubmit} className="modal-form">
              <div className="modal-field">
                <label className="modal-label" htmlFor="name">Name</label>
                <input
                  id="name"
                  type="text"
                  className="modal-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Doe"
                  autoFocus
                />
              </div>
              <div className="modal-field">
                <label className="modal-label" htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  className="modal-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="john@example.com"
                />
              </div>
              <div className="modal-field">
                <label className="modal-label" htmlFor="birthday">
                  Birthday <span style={{ fontWeight: 400, color: '#9ca3af', fontSize: '12px' }}>(month and day only)</span>
                </label>
                <input
                  id="birthday"
                  type="text"
                  className="modal-input"
                  value={birthday}
                  onChange={(e) => setBirthday(e.target.value)}
                  placeholder="MM-DD (e.g. 02-18)"
                  maxLength={5}
                />
              </div>
              <div className="modal-field" style={{ borderTop: '1px solid #e5e7eb', paddingTop: '12px', marginTop: '4px' }}>
                <p className="modal-label" style={{ marginBottom: '8px' }}>Opt-Out Settings</p>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: '8px' }}>
                  <input
                    type="checkbox"
                    checked={optOutDigest}
                    onChange={(e) => setOptOutDigest(e.target.checked)}
                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '13px', color: '#374151' }}>Opt out of digest emails</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={optOutBirthday}
                    onChange={(e) => setOptOutBirthday(e.target.checked)}
                    style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                  />
                  <span style={{ fontSize: '13px', color: '#374151' }}>Opt out of birthday shoutouts</span>
                </label>
              </div>
              {error && <p className="modal-error">{error}</p>}
              <div className="modal-actions">
                <button
                  type="button"
                  className="modal-button cancel"
                  onClick={handleCloseModal}
                  disabled={isSubmitting}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="modal-button submit"
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (editingRecipient ? 'Saving...' : 'Adding...') : (editingRecipient ? 'Save' : 'Add')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deletingRecipient && (
        <div className="modal-overlay" onClick={handleCancelDelete}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2 className="modal-title">Delete Recipient</h2>
            <p className="delete-confirmation-text">
              Delete {deletingRecipient.name}? This cannot be undone.
            </p>
            <div className="modal-actions">
              <button
                type="button"
                className="modal-button cancel"
                onClick={handleCancelDelete}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="modal-button delete"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
