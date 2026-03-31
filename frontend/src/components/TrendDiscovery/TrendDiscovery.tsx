import { TopicInput } from './TopicInput';
import { TrendChart } from './TrendChart';
import { KeywordList } from './KeywordList';
import { TrendSelector } from './TrendSelector';
import { useTrends } from '../../hooks/useTrends';

interface Props {
  onSendKeywords: (keywords: string[]) => void;
}

export function TrendDiscovery({ onSendKeywords }: Props) {
  const { result, loading, selectedKeywords, discover, toggleKeyword } = useTrends();

  return (
    <div className="space-y-4">
      <TopicInput onDiscover={discover} loading={loading} />

      {result && (
        <>
          <TrendChart data={result.interest_over_time} />

          <div className="grid grid-cols-2 gap-4">
            <KeywordList
              title="Rising Queries"
              queries={result.rising_queries}
              selected={selectedKeywords}
              onToggle={toggleKeyword}
            />
            <KeywordList
              title="Top Queries"
              queries={result.top_queries}
              selected={selectedKeywords}
              onToggle={toggleKeyword}
            />
          </div>

          <TrendSelector
            selectedCount={selectedKeywords.length}
            onSend={() => onSendKeywords(selectedKeywords)}
          />
        </>
      )}

      {!result && !loading && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-sm">Enter a healthcare topic to discover trending keywords</p>
        </div>
      )}
    </div>
  );
}
