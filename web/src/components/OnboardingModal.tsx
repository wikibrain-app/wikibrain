import { useState } from 'react';
import { Modal, btnGhost, btnPrimary } from './ui';
import { AppliedResult, TemplatePicker } from './TemplatePicker';
import { useT } from '../i18n';

// Shown on first visit to an empty workspace: pick a template -> apply -> get the agent kickoff prompt.
export function OnboardingModal({ onDone, onSkip, onPasteUrl }: { onDone: () => void; onSkip: () => void; onPasteUrl?: () => void }) {
  const [result, setResult] = useState<{ created: string[]; skipped: string[]; prompt: string } | null>(null);
  const { t } = useT();
  return (
    <Modal title={t('onboarding.title')} sub={t('onboarding.sub')} onClose={result ? onDone : onSkip} wide>
      {result ? (
        <>
          <AppliedResult r={result} onClose={onDone} showPrompt={false} hideDone />
          {/* The result screen used to end in "Done", which leads nowhere. The one thing worth doing next is adding a source. */}
          <div className="mt-4 flex flex-wrap justify-end gap-2">
            <button className={btnGhost} onClick={onDone}>{t('onboarding.lookAround')}</button>
            <button className={btnPrimary} data-testid="onboarding-paste-url" onClick={() => { onDone(); onPasteUrl?.(); }}>{t('onboarding.pasteFirst')}</button>
          </div>
        </>
      ) : (
        <>
          <TemplatePicker minimal onApplied={r => setResult(r)} />
          <div className="mt-4 text-right"><button className={`${btnGhost} border-transparent`} onClick={onSkip}>{t('onboarding.skip')}</button></div>
        </>
      )}
    </Modal>
  );
}
