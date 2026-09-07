import { useState } from 'react';
import { Modal, btnGhost } from './ui';
import { AppliedResult, TemplatePicker } from './TemplatePicker';
import { useT } from '../i18n';

// Shown on first visit to an empty workspace: pick a template -> apply -> get the agent kickoff prompt.
export function OnboardingModal({ onDone, onSkip }: { onDone: () => void; onSkip: () => void }) {
  const [result, setResult] = useState<{ created: string[]; skipped: string[]; prompt: string } | null>(null);
  const { t } = useT();
  return (
    <Modal title={t('onboarding.title')} sub={t('onboarding.sub')} onClose={result ? onDone : onSkip} wide>
      {result ? <AppliedResult r={result} onClose={onDone} showPrompt={false} /> : (
        <>
          <TemplatePicker minimal onApplied={r => setResult(r)} />
          <div className="mt-4 text-right"><button className={`${btnGhost} border-transparent`} onClick={onSkip}>{t('onboarding.skip')}</button></div>
        </>
      )}
    </Modal>
  );
}
