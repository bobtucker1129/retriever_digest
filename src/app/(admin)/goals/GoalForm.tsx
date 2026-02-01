'use client';

import { useState, useRef } from 'react';
import { GoalData, saveGoal } from './actions';

type GoalFormProps = {
  title: string;
  type: 'monthly' | 'annual';
  initialData: GoalData;
};

export default function GoalForm({ title, type, initialData }: GoalFormProps) {
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formRef.current) return;

    setSaving(true);
    setMessage(null);

    const formData = new FormData(formRef.current);
    const result = await saveGoal(formData);

    setSaving(false);

    if (result.success) {
      setMessage({ type: 'success', text: 'Goals saved successfully' });
    } else {
      setMessage({ type: 'error', text: result.error || 'Failed to save goals' });
    }

    setTimeout(() => setMessage(null), 3000);
  }

  return (
    <div className="goal-section">
      <h2 className="goal-section-title">{title}</h2>
      <form ref={formRef} className="goal-form" onSubmit={handleSubmit}>
        <input type="hidden" name="type" value={type} />
        
        <div className="goal-field">
          <label htmlFor={`${type}-salesRevenue`} className="goal-label">
            Sales Revenue ($)
          </label>
          <input
            type="number"
            id={`${type}-salesRevenue`}
            name="salesRevenue"
            defaultValue={initialData.salesRevenue}
            step="0.01"
            min="0"
            className="goal-input"
          />
        </div>

        <div className="goal-field">
          <label htmlFor={`${type}-salesCount`} className="goal-label">
            Invoices Created
          </label>
          <input
            type="number"
            id={`${type}-salesCount`}
            name="salesCount"
            defaultValue={initialData.salesCount}
            step="1"
            min="0"
            className="goal-input"
          />
        </div>

        <div className="goal-field">
          <label htmlFor={`${type}-estimatesCreated`} className="goal-label">
            Estimates Created
          </label>
          <input
            type="number"
            id={`${type}-estimatesCreated`}
            name="estimatesCreated"
            defaultValue={initialData.estimatesCreated}
            step="1"
            min="0"
            className="goal-input"
          />
        </div>

        <div className="goal-field">
          <label htmlFor={`${type}-newCustomers`} className="goal-label">
            New Customers
          </label>
          <input
            type="number"
            id={`${type}-newCustomers`}
            name="newCustomers"
            defaultValue={initialData.newCustomers}
            step="1"
            min="0"
            className="goal-input"
          />
        </div>

        <div className="goal-actions">
          <button type="submit" className="save-button" disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
          {message && (
            <p className={`goal-message ${message.type}`}>
              {message.text}
            </p>
          )}
        </div>
      </form>
    </div>
  );
}
