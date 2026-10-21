# TODO

## Priority

### Operations

- [ ] **테스트 관리자 계정 정리**: 실제 운영 DB의 `testadmin1`, `testadmin2`, `testadmin3`을 삭제하거나 관리자 권한을 회수한다.
  - 변경 범위: 운영 DB의 `users`
  - 완료 기준: 운영 DB에 테스트용 관리자 계정이 남아 있지 않다.
  - 차단 요인: 운영 DB 접근과 적용 시점은 사용자가 결정한다.

---

## Completed

현재 라운드에서 완료한 항목은 커밋 전에 비운다.

---

## Notes

- **문서 소유**: 현재 기술 계약은 `docs/spec/`, 운영 절차는 `docs/runbooks/`, 문서 색인은 `docs/README.md`가 소유한다.
- **브라우저 확인**: UI 변경은 자동 E2E가 없으므로 실제 브라우저에서 해당 흐름을 확인한다.
