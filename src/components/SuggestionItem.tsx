import type { ScoredItem } from '../data/library/libraryIndex';
import type { FeedbackType } from '../core/types';
import { FeedbackButtons } from './FeedbackButtons';

export function SuggestionItem({
  suggestion,
  onFeedback,
  onAddToAudiotool,
  canAddToAudiotool
}: {
  suggestion: ScoredItem;
  onFeedback: (type: FeedbackType) => void;
  onAddToAudiotool: () => void;
  canAddToAudiotool: boolean;
}) {
  return (
    <article className="card">
      <h3>{suggestion.item.name}</h3>
      <div className="pill-row">
        <span className="pill">{suggestion.item.type}</span>
        <span className="pill">{suggestion.item.role}</span>
        <span className="pill">score {suggestion.score}</span>
      </div>
      <p>{suggestion.reasons.join('; ')}.</p>
      <p className="subtle">{suggestion.item.tags.join(', ')}</p>
      <FeedbackButtons onFeedback={onFeedback} />
      {['instrument', 'preset'].includes(suggestion.item.type) ? (
        <button className="button" type="button" onClick={onAddToAudiotool} disabled={!canAddToAudiotool}>
          Add instrument to Audiotool
        </button>
      ) : null}
    </article>
  );
}
