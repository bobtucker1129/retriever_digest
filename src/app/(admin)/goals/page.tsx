import { getGoals } from './actions';
import GoalForm from './GoalForm';

export const dynamic = 'force-dynamic';

export default async function GoalsPage() {
  const goals = await getGoals();

  return (
    <div className="goals-page">
      <h1 className="page-title">Sales Goals</h1>
      <div className="goals-grid">
        <GoalForm title="Monthly Goals" type="monthly" initialData={goals.monthly} />
        <GoalForm title="Annual Goals" type="annual" initialData={goals.annual} />
      </div>
    </div>
  );
}
