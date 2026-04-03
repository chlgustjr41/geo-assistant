import { useState } from "react";
import { LogOut, RotateCcw } from "lucide-react";
import { WritingAssistant } from "./WritingAssistant/WritingAssistant";
import { RulesAndCorpus } from "./RulesAndCorpus/RulesAndCorpus";
import { Settings } from "./Settings/Settings";
import { ToastContainer, toast } from "./shared/Toast";
import { settingsApi } from "../services/api";
import { useExtractionContext } from "../contexts/ExtractionContext";
import { useAuth } from "../contexts/AuthContext";
import type { Tab } from "../types";

interface TabDef {
  id: Tab;
  label: string;
}

const TABS: TabDef[] = [
  { id: "writing", label: "Writing Assistant" },
  { id: "rules", label: "Rules & Corpus" },
  { id: "settings", label: "Settings" },
];

// localStorage keys used by the app (cleared on workspace reset)
const LOCAL_STORAGE_KEYS = [
  'geo_article_text',
  'geo_selected_rule_sets',
  'geo_extractor_topic',
  'geo_extractor_queries',
  'geo_extractor_name',
  'geo_extractor_models',
  'geo_extractor_results',
  'geo_extractor_use_corpus',
];

export function Layout() {
  const [activeTab, setActiveTab] = useState<Tab>("writing");
  const [resetting, setResetting] = useState(false);
  const { extracting } = useExtractionContext();
  const { user, signOut } = useAuth();

  const handleResetWorkspace = async () => {
    if (!confirm(
      'Reset workspace?\n\n' +
      'This clears all input fields and cached data.\n' +
      'Your saved query sets, corpus, rule sets, history, and settings are preserved.'
    )) return;
    setResetting(true);
    try {
      await settingsApi.resetWorkspace();
      // Clear frontend persisted input state
      LOCAL_STORAGE_KEYS.forEach((k) => localStorage.removeItem(k));
      sessionStorage.clear();
      toast('success', 'Workspace reset — reloading...');
      setTimeout(() => window.location.reload(), 600);
    } catch {
      toast('error', 'Failed to reset workspace');
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center gap-8">
            <div className="py-3 shrink-0">
              <h1 className="text-base font-bold text-gray-900">
                GEO Assistant
              </h1>
              <p className="text-xs text-gray-400">
                Powered by AutoGEO &middot; ICLR 2026
              </p>
            </div>
            <nav className="flex flex-1">
              {TABS.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-1.5 px-5 py-4 text-sm font-medium border-b-2 transition-colors ${
                    activeTab === tab.id
                      ? "border-primary-600 text-primary-600"
                      : "border-transparent text-gray-500 hover:text-gray-800 hover:border-gray-300"
                  }`}
                >
                  {tab.label}
                  {tab.id === "rules" && extracting && (
                    <span className="inline-flex h-2 w-2 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-300 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-primary-400" />
                    </span>
                  )}
                </button>
              ))}
            </nav>
            <button
              onClick={handleResetWorkspace}
              disabled={resetting}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-400 border border-gray-200 rounded-lg hover:text-red-600 hover:border-red-300 hover:bg-red-50 disabled:opacity-50 transition-colors shrink-0"
              title="Clear input fields and cached data. Saved query sets, corpus, rule sets, history, and settings are preserved."
            >
              <RotateCcw size={12} className={resetting ? 'animate-spin' : ''} />
              Reset Workspace
            </button>
            {user && (
              <button
                onClick={signOut}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-400 border border-gray-200 rounded-lg hover:text-red-600 hover:border-red-300 hover:bg-red-50 transition-colors shrink-0"
                title={`Signed in as ${user.email}`}
              >
                <LogOut size={12} />
                Sign Out
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6">
        <div className={activeTab !== "writing" ? "hidden" : ""}>
          <WritingAssistant />
        </div>
        <div className={activeTab !== "rules" ? "hidden" : ""}>
          <RulesAndCorpus />
        </div>
        <div className={activeTab !== "settings" ? "hidden" : ""}>
          <Settings />
        </div>
      </main>

      <ToastContainer />
    </div>
  );
}
