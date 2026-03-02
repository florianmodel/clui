import type { Step } from '@gui-bridge/shared';
import type { StepInputProps } from './inputs/TextInput.js';
import { TextInput } from './inputs/TextInput.js';
import { NumberInput } from './inputs/NumberInput.js';
import { Dropdown } from './inputs/Dropdown.js';
import { RadioGroup } from './inputs/RadioGroup.js';
import { CheckboxInput } from './inputs/CheckboxInput.js';
import { ToggleInput } from './inputs/ToggleInput.js';
import { FileInput } from './inputs/FileInput.js';
import { DirectoryInput } from './inputs/DirectoryInput.js';
import { TextareaInput } from './inputs/TextareaInput.js';

type Props = Omit<StepInputProps, 'step'> & { step: Step };

export function StepRenderer({ step, value, onChange, error }: Props) {
  const props = { step, value, onChange, error };

  switch (step.type) {
    case 'text_input':     return <TextInput {...props} />;
    case 'number':         return <NumberInput {...props} />;
    case 'dropdown':       return <Dropdown {...props} />;
    case 'radio':          return <RadioGroup {...props} />;
    case 'checkbox':       return <CheckboxInput {...props} />;
    case 'toggle':         return <ToggleInput {...props} />;
    case 'file_input':     return <FileInput {...props} />;
    case 'directory_input': return <DirectoryInput {...props} />;
    case 'textarea':       return <TextareaInput {...props} />;
    default:
      return <div style={{ color: 'var(--red)', fontSize: 12 }}>Unknown step type: {(step as Step).type}</div>;
  }
}
