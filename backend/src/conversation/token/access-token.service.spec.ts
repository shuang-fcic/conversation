import { AccessTokenService } from './access-token.service';

describe('AccessTokenService', () => {
  let service: AccessTokenService;

  beforeEach(() => {
    service = new AccessTokenService();
  });

  describe('mint', () => {
    it('returns a UUID v4 string', () => {
      const token = service.mint();
      expect(token).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it('returns a unique value each call', () => {
      const a = service.mint();
      const b = service.mint();
      expect(a).not.toBe(b);
    });
  });
});
