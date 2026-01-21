'use client';

import { GoalData } from './actions';

type GoalFormProps = {
  title: string;
  type: 'monthly' | 'annual';
  initialData: GoalData;
};

export default function GoalForm({ title, type, initialData }: GoalFormProps) {
  return (
    <div className="goal-section">
      <h2 className="goal-section-title">{title}</h2>
      <form className="goal-form">
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
            Sales Count
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
      </form>
    </div>
  );
}
