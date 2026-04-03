import { useState } from "react";
import { WritingAssistant } from "./WritingAssistant/WritingAssistant";
import { RulesAndCorpus } from "./RulesAndCorpus/RulesAndCorpus";
import { Settings } from "./Settings/Settings";
import { ToastContainer } from "./shared/Toast";
import { useExtractionContext } from "../contexts/ExtractionContext";
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

export function Layout() {
  const [activeTab, setActiveTab] = useState<Tab>("writing");
  const { extracting } = useExtractionContext();

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
            <nav className="flex">
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
