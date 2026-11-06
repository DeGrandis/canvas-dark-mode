# Backlog triage, November 2026

Every pull request and issue up to #217, and what happened to it on
`feature/merge-community-backlog`.

## Pull requests

**Merged with a real merge commit** (GitHub marks these merged, and credits the author,
once the branch reaches master). URLs were normalized and each host was confirmed as Canvas
by its `x-canvas-meta` response header.

The schools these PRs added were taken back out before release, so the manifest matches the
1.1.6 list exactly. New hosts would have made every existing user approve the extension again.
Those schools now turn it on with **Enable on this site**.

- Schools: #32, #53, #72, #78, #80, #85, #86, #95, #107, #110, #114, #121, #125, #133, #134,
  #136, #137, #138, #144, #148, #152, #155, #158, #159, #164, #165, #168, #169, #172, #179,
  #187, #188, #191, #193, #194, #195, #198, #204, #209, #212, #214
- Styles taken as written: #67
- Styles taken in part, see the merge commit: #91 (scrollbars, tooltip)
- Intent kept, code replaced, see the merge commit: #14, #92, #131

**Closed earlier, school added anyway:** #51, #58, #97, #115, #116, #119, #120, #141, #149,
#167, #170, #171, #182. #170 and #182 could not be used as written: broken JSON and an
invalid match pattern.

**Closed earlier, school already present:** #7, #27

**Closed earlier, school dropped:** #79. `lms.cyanna.com` no longer resolves.

**Closed earlier, styles used:** #21 (the contrast guard covers this), #44 (calendar lists, inbox subject,
school), #48 (assignment header and footer), #130 (tooltip, done differently), #173 (code,
done differently)

**Already landed through another PR:** #15, #33

**Not taken:** #25 (empty), #174 (adding a license is the owner's decision), #175 (breaks
the popup's HTML)

**Merged before this work:** #1, #3, #4, #5, #8, #11, #12, #13, #16, #18, #19, #22, #23,
#24, #29, #34, #35, #36, #38, #42, #49

## Issues

"Confirmed" means the kind of bug was reproduced and then shown fixed, not that each
reporter's own page was visited.

**School request, covered by Enable on this site, the 1.1.6 list or `*.instructure.com`:** #6, #62, #63, #66, #68,
#69, #74, #81, #90, #98, #103, #106, #112, #118, #150, #151, #153, #157, #177, #181, #205

**Fixed, confirmed on live Canvas:** #73 (school nav icons), #94, #184 (nav tooltip), #108
(half width menu)

**Fixed, confirmed with real InstUI components at Canvas's version:** #145, #146, #147, #199,
#215, #217 (Files), #143 (download menu), #208 (white around inputs)

**Fixed, confirmed on the fixture and on live pages:** #26, #60, #71, #84, #101, #123, #124,
#129, #186, #202 (unreadable text in teacher and school content), #154 (code)

**Fixed, confirmed on the fixture only:** #2, #17, #77, #161 (rich content editor)

**Changed but not seen working, these pages need a login:**

- Gradebook: #99, #122, #156
- Calendar: #9, #55, #88, #105, #128
- Dashboard and to do list: #20, #30, #64, #82, #87, #104, #162, #176
- Course sidebar: #31, #37, #65, #117, #127, #190
- Discussions: #10, #163
- Quizzes: #47, #132, #183, #210
- Inbox: #40, #100
- Assignments and submissions: #56, #76, #96, #126, #207
- SpeedGrader: #213
- Admin: #178
- Light spots, screenshot only: #39, #45, #46, #50, #52, #54, #57, #61, #70, #75, #83, #89,
  #93, #102, #111, #113, #135, #139, #140, #142, #160, #166, #180, #185, #189, #192, #197,
  #200, #203, #211

**Not fixed:**

- #109: embedded documents draw as white pages. Only the area around them can be dark.
- #59: the math menu is not styled.
- #196: `school.managedclass.com` did not respond, so it could not be confirmed as Canvas and
  stays off the list. That user can now try **Enable on this site**.
- #206: not this extension. That school was not in the manifest, so it did not run there.
  That school can now use **Enable on this site**.

**Feature requests, built:** #201 (**Enable on this site** in the popup)

**Feature requests, not built:** #41 (off switch), #43 (custom colours)

**Not actionable:** #28 (closed, Firefox add-on exists), #216
