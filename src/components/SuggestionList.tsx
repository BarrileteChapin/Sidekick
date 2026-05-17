import type { FeedbackType } from '../core/types';
import type { ScoredItem } from '../data/library/libraryIndex';
import { SuggestionItem } from './SuggestionItem';

export function SuggestionList({
  suggestions,
  onFeedback,
  onAddToAudiotool,
  canAddToAudiotool
}: {
  suggestions: ScoredItem[];
  onFeedback: (suggestion: ScoredItem, type: FeedbackType) => void;
  onAddToAudiotool: (suggestion: ScoredItem) => void;
  canAddToAudiotool: boolean;
}) {
  return (
    <section aria-labelledby="suggestions-title" className="stack">
      <div className="suggestions-header">
        <h2 id="suggestions-title">Next best moves</h2>
        <p className="subtle">Ranked by BPM, key, missing roles, style fit, and your feedback.</p>
      </div>
      {suggestions.map((suggestion) => (
        <SuggestionItem
          key={suggestion.item.id}
          suggestion={suggestion}
          onFeedback={(type) => onFeedback(suggestion, type)}
          onAddToAudiotool={() => onAddToAudiotool(suggestion)}
          canAddToAudiotool={canAddToAudiotool}
        />
      ))}
    </section>
  );
}
