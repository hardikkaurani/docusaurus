/**
 * Copyright (c) Facebook, Inc. and its affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {logger} from '@docusaurus/logger';
import beforeCli, {ignoreUpdate} from '../beforeCli.mjs';
import type {UpdateInfo} from 'update-notifier';

const {mockNotifierConfig, mockState} = vi.hoisted(() => ({
  mockNotifierConfig: {
    get: vi.fn(),
    set: vi.fn(),
  },
  mockState: {
    update: undefined as UpdateInfo | undefined,
  },
}));

vi.mock('update-notifier', () => ({
  default: vi.fn(() => ({
    config: mockNotifierConfig,
    get update() {
      return mockState.update;
    },
    check: vi.fn(),
  })),
}));

describe('beforeCli ignoreUpdate', () => {
  it('returns false when update is undefined or current is missing', () => {
    expect(ignoreUpdate(undefined)).toBe(false);
    expect(ignoreUpdate({} as UpdateInfo)).toBe(false);
  });

  it('ignores legacy 0.0.0 canary releases', () => {
    expect(
      ignoreUpdate({
        current: '0.0.0-1234',
        latest: '3.7.0',
        name: '@docusaurus/core',
        type: 'major',
      }),
    ).toBe(true);
  });

  it('ignores versions with canary suffix (closes #11013)', () => {
    expect(
      ignoreUpdate({
        current: '3.7.0-canary-6264',
        latest: '3.7.0',
        name: '@docusaurus/core',
        type: 'patch',
      }),
    ).toBe(true);
    expect(
      ignoreUpdate({
        current: '3.8.0-canary-7123+7b6826b',
        latest: '3.8.0',
        name: '@docusaurus/core',
        type: 'patch',
      }),
    ).toBe(true);
  });

  it('ignores prerelease versions', () => {
    expect(
      ignoreUpdate({
        current: '4.0.0-alpha.0',
        latest: '4.0.0',
        name: '@docusaurus/core',
        type: 'major',
      }),
    ).toBe(true);
    expect(
      ignoreUpdate({
        current: '4.0.0-beta.1',
        latest: '4.0.0',
        name: '@docusaurus/core',
        type: 'major',
      }),
    ).toBe(true);
  });

  it('does not ignore regular stable versions', () => {
    expect(
      ignoreUpdate({
        current: '3.6.0',
        latest: '3.7.0',
        name: '@docusaurus/core',
        type: 'minor',
      }),
    ).toBe(false);
    expect(
      ignoreUpdate({
        current: '3.7.0',
        latest: '3.7.1',
        name: '@docusaurus/core',
        type: 'patch',
      }),
    ).toBe(false);
  });
});

describe('beforeCli control flow', () => {
  const originalNodeVersion = process.version;

  beforeEach(() => {
    vi.clearAllMocks();
    mockState.update = undefined;
    Object.defineProperty(process, 'version', {
      value: 'v26.0.0',
      configurable: true,
    });
  });

  afterEach(() => {
    Object.defineProperty(process, 'version', {
      value: originalNodeVersion,
      configurable: true,
    });
  });

  it('suppresses update notification for canary installations while passing Node.js check', async () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const processExitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => {}) as unknown as (
        code?: string | number | null | undefined,
      ) => never);

    mockState.update = {
      current: '3.7.0-canary-6264',
      latest: '3.7.0',
      name: '@docusaurus/core',
      type: 'patch',
    };

    await beforeCli();

    expect(mockNotifierConfig.set).toHaveBeenCalledWith(
      'update',
      mockState.update,
    );
    expect(consoleLogSpy).not.toHaveBeenCalled();
    expect(processExitSpy).not.toHaveBeenCalled();
  });

  it('displays update notification for stable outdated installations while passing Node.js check', async () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const processExitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => {}) as unknown as (
        code?: string | number | null | undefined,
      ) => never);

    mockState.update = {
      current: '3.6.0',
      latest: '3.7.0',
      name: '@docusaurus/core',
      type: 'minor',
    };

    await beforeCli();

    expect(mockNotifierConfig.set).toHaveBeenCalledWith(
      'update',
      mockState.update,
    );
    expect(consoleLogSpy).toHaveBeenCalled();
    expect(consoleLogSpy.mock.calls[0]?.[0]).toContain('Update available');
    expect(consoleLogSpy.mock.calls[0]?.[0]).toContain('3.6.0');
    expect(consoleLogSpy.mock.calls[0]?.[0]).toContain('3.7.0');
    expect(processExitSpy).not.toHaveBeenCalled();
  });

  it('does not bypass minimum Node.js version validation when canary update is suppressed', async () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const loggerErrorSpy = vi
      .spyOn(logger, 'error')
      .mockImplementation(() => {});
    const loggerInfoSpy = vi.spyOn(logger, 'info').mockImplementation(() => {});
    const processExitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => {}) as unknown as (
        code?: string | number | null | undefined,
      ) => never);

    mockState.update = {
      current: '3.7.0-canary-6264',
      latest: '3.7.0',
      name: '@docusaurus/core',
      type: 'patch',
    };

    Object.defineProperty(process, 'version', {
      value: 'v18.0.0',
      configurable: true,
    });

    await beforeCli();

    expect(consoleLogSpy).not.toHaveBeenCalled();
    expect(loggerErrorSpy).toHaveBeenCalledWith(
      'Minimum Node.js version not met :(',
    );
    expect(loggerInfoSpy).toHaveBeenCalled();
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('does not bypass minimum Node.js version validation when prerelease update is suppressed', async () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const loggerErrorSpy = vi
      .spyOn(logger, 'error')
      .mockImplementation(() => {});
    const loggerInfoSpy = vi.spyOn(logger, 'info').mockImplementation(() => {});
    const processExitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => {}) as unknown as (
        code?: string | number | null | undefined,
      ) => never);

    mockState.update = {
      current: '4.0.0-alpha.0',
      latest: '4.0.0',
      name: '@docusaurus/core',
      type: 'major',
    };

    Object.defineProperty(process, 'version', {
      value: 'v18.0.0',
      configurable: true,
    });

    await beforeCli();

    expect(consoleLogSpy).not.toHaveBeenCalled();
    expect(loggerErrorSpy).toHaveBeenCalledWith(
      'Minimum Node.js version not met :(',
    );
    expect(loggerInfoSpy).toHaveBeenCalled();
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });

  it('triggers error and exit on unsupported Node.js versions even when no update is available', async () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const loggerErrorSpy = vi
      .spyOn(logger, 'error')
      .mockImplementation(() => {});
    const loggerInfoSpy = vi.spyOn(logger, 'info').mockImplementation(() => {});
    const processExitSpy = vi
      .spyOn(process, 'exit')
      .mockImplementation((() => {}) as unknown as (
        code?: string | number | null | undefined,
      ) => never);

    mockState.update = undefined;

    Object.defineProperty(process, 'version', {
      value: 'v18.0.0',
      configurable: true,
    });

    await beforeCli();

    expect(consoleLogSpy).not.toHaveBeenCalled();
    expect(loggerErrorSpy).toHaveBeenCalledWith(
      'Minimum Node.js version not met :(',
    );
    expect(loggerInfoSpy).toHaveBeenCalled();
    expect(processExitSpy).toHaveBeenCalledWith(1);
  });
});
