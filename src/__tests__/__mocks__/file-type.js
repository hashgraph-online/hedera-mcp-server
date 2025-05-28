/**
 * Mock for file-type module used in tests
 */
import { jest } from '@jest/globals';

export const fileTypeFromBuffer = jest
  .fn()
  .mockResolvedValue({ ext: 'png', mime: 'image/png' });
export const fileTypeFromFile = jest
  .fn()
  .mockResolvedValue({ ext: 'png', mime: 'image/png' });
export const fileTypeFromStream = jest
  .fn()
  .mockResolvedValue({ ext: 'png', mime: 'image/png' });

export default {
  fileTypeFromBuffer,
  fileTypeFromFile,
  fileTypeFromStream,
};
