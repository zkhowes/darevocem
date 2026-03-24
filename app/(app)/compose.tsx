import React, { useEffect, useCallback } from 'react';
import { useRouter } from 'expo-router';
import { SectionLayout } from '../../components/sections/SectionLayout';
import { IntentSection } from '../../components/sections/IntentSection';
import { ComposeSection } from '../../components/sections/ComposeSection';
import { useFocusStore } from '../../stores/focus';
import { useCompositionStore } from '../../stores/composition';
import { getTimeOfDay } from '../../services/context';
import type { ComposeItem } from '../../types';

export default function ComposeScreen() {
  const router = useRouter();
  const reset = useCompositionStore((s) => s.reset);
  const focusReset = useFocusStore((s) => s.reset);
  const setSection = useFocusStore((s) => s.setSection);

  // Fresh session every time we enter this screen
  useEffect(() => {
    reset();
    focusReset();
  }, []);

  const handleNavigateHome = useCallback(() => {
    router.back();
  }, []);

  const handleRefine = useCallback((item: ComposeItem) => {
    // Task 10: open the refinement/modifier flow
    console.log('Refine:', item.text);
  }, []);

  const handleModify = useCallback((item: ComposeItem) => {
    // Task 15: open keyboard/edit flow via context menu
    console.log('Modify:', item.text);
  }, []);

  const handlePhraseSave = useCallback(() => {
    // Task 13: save to saved_phrases
    console.log('Save phrase');
  }, []);

  const handlePhraseNavigateUp = useCallback(() => {
    // Return focus to the compose list when navigating up from phrase bar
    setSection('compose');
  }, []);

  return (
    <SectionLayout
      headerContent={
        <IntentSection
          onNavigateHome={handleNavigateHome}
          timeOfDay={getTimeOfDay()}
        />
      }
      itemsContent={
        <ComposeSection
          onRefine={handleRefine}
          onModify={handleModify}
        />
      }
      onPhraseSave={handlePhraseSave}
      onPhraseNavigateUp={handlePhraseNavigateUp}
    />
  );
}
