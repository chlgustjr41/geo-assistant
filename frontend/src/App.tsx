import { Layout } from './components/Layout';
import { ExtractionProvider } from './contexts/ExtractionContext';

export default function App() {
  return (
    <ExtractionProvider>
      <Layout />
    </ExtractionProvider>
  );
}
