import { createContext, useContext, useState } from 'react';

interface ExtractionContextValue {
  extracting: boolean;
  setExtracting: (v: boolean) => void;
}

const ExtractionContext = createContext<ExtractionContextValue>({
  extracting: false,
  setExtracting: () => {},
});

export function ExtractionProvider({ children }: { children: React.ReactNode }) {
  const [extracting, setExtracting] = useState(false);
  return (
    <ExtractionContext.Provider value={{ extracting, setExtracting }}>
      {children}
    </ExtractionContext.Provider>
  );
}

export function useExtractionContext() {
  return useContext(ExtractionContext);
}
