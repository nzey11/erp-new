# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e4]:
    - generic [ref=e5]:
      - img "OPRIX" [ref=e6]
      - paragraph [ref=e7]: Войдите в систему
    - generic [ref=e8]:
      - generic [ref=e9]:
        - generic [ref=e10]:
          - strong [ref=e12]: Логин
          - textbox "login" [active] [ref=e13]
        - generic [ref=e14]:
          - strong [ref=e16]: Пароль
          - generic [ref=e17]:
            - textbox "******" [ref=e18]
            - img "eye-invisible" [ref=e20] [cursor=pointer]:
              - img [ref=e21]
        - button "Войти" [ref=e24] [cursor=pointer]:
          - generic [ref=e25]: Войти
      - paragraph
  - region "Notifications alt+T"
  - button "Open Next.js Dev Tools" [ref=e31] [cursor=pointer]:
    - img [ref=e32]
  - alert [ref=e35]
```