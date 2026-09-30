import { Injectable } from '@nestjs/common';
import { InquirerService } from 'nest-commander';

export interface SelectChoice<T> {
  name: string;
  value: T;
}

/**
 * Thin wrapper over nest-commander's InquirerService so interactive commands
 * express prompts with typed helpers and unit tests mock a single collaborator.
 * Only used by operator-driven ScriptsModule commands (never cron).
 */
@Injectable()
export class PromptService {
  constructor(private readonly inquirerService: InquirerService) {}

  async input(message: string, defaultValue?: string): Promise<string> {
    const { value } = await this.inquirerService.inquirer.prompt<{
      value: string;
    }>([{ type: 'input', name: 'value', message, default: defaultValue }]);
    return value;
  }

  /** Opens $EDITOR for large/multi-line content (subject, body, JSON). */
  async editor(message: string, defaultValue?: string): Promise<string> {
    const { value } = await this.inquirerService.inquirer.prompt<{
      value: string;
    }>([{ type: 'editor', name: 'value', message, default: defaultValue }]);
    return value;
  }

  async confirm(message: string, defaultValue = false): Promise<boolean> {
    const { value } = await this.inquirerService.inquirer.prompt<{
      value: boolean;
    }>([{ type: 'confirm', name: 'value', message, default: defaultValue }]);
    return value;
  }

  async select<T>(
    message: string,
    choices: Array<SelectChoice<T>>,
  ): Promise<T> {
    const { value } = await this.inquirerService.inquirer.prompt<{ value: T }>([
      { type: 'list', name: 'value', message, choices },
    ]);
    return value;
  }
}
