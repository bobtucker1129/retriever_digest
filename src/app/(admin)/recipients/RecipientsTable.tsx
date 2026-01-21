'use client';

import { useState } from 'react';
import { RecipientData, addRecipient, updateRecipient, deleteRecipient } from './actions';

type Props = {
  initialRecipients: RecipientData[];
};

export default function RecipientsTable({ initialRecipients }: Props) {
  const [recipients, setRecipients] = useState<RecipientData[]>(initialRecipients);
  const [showModal, setShowModal] = useState(false);
  const [editingRecipient, setEditingRecipient] = useState<RecipientData | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingRecipient, setDeletingRecipient] = useState<RecipientData | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleOpenModal = () => {
    setEditingRecipient(null);
    setName('');
    setEmail('');
    setError('');
    setShowModal(true);
  };

  const handleOpenEditModal = (recipient: RecipientData) => {
    setEditingRecipient(recipient);
    setName(recipient.name);
    setEmail(recipient.email);
    setError('');
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingRecipient(null);
    setName('');
    setEmail('');
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
      const result = await updateRecipient(editingRecipient.id, name, email);
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
      const result = await addRecipient(name, email);
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
