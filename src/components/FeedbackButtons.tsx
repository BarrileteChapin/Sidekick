import type { FeedbackType } from '../core/types';

export function FeedbackButtons({ onFeedback }: { onFeedback: (type: FeedbackType) => void }) {
  return (
    <div className="pill-row" aria-label="Suggestion feedback">
      <button className="button secondary" type="button" onClick={() => onFeedback('accepted')}>
        Accept
      </button>
      <button className="button secondary" type="button" onClick={() => onFeedback('auditioned')}>
        Auditioned
      </button>
      <button className="button secondary" type="button" onClick={() => onFeedback('ignored')}>
        Ignore
      </button>
    </div>
  );
}
