"""Patch data.json with the dates recovered from the Oct 27 site schedule
(nathan_herling/data/schedule.json, built from D2L screenshots).

Adds:     CHEM 181 Mastering HW due x4, INFO 579 Unit 11-15 assignments,
Dates:    INFO 555 Programming 4 (+quiz) and Programming 5
Updates:  INFO 555 final -> online window 3:30-5:30 PM (no MAT 231 clash);
          INFO 579 Project 3 -> 11:59 PM
Removes:  the two placeholders those replace (CHEM HW 10-12, INFO 579 weekly)

Idempotent: matches by id, keeps every existing `done` flag, writes
data.json.bak first. Run from the repo root or anywhere:

    python tools/patch_2026-11-14.py
"""
import json
import os
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data.json")


def log(msg):
    print(f"[patch] {msg}", flush=True)


def item(id_, date, time, course, typ, title, location="", notes="", end=None):
    return dict(id=id_, date=date, time=time, end=end, course=course, type=typ,
                title=title, location=location, notes=notes, done=False)


ADD = [
    item("c001", "2026-11-16", "23:55", "CHEM 181", "Homework", "Mastering HW due", "Mastering",
         "Due 11:55 PM (syllabus). From D2L schedule; HW number not recorded"),
    item("c002", "2026-11-30", "23:55", "CHEM 181", "Homework", "Mastering HW due", "Mastering",
         "Due 11:55 PM (syllabus). From D2L schedule; HW number not recorded"),
    item("c003", "2026-12-07", "23:55", "CHEM 181", "Homework", "Mastering HW due", "Mastering",
         "Due 11:55 PM (syllabus). From D2L schedule; HW number not recorded"),
    item("c004", "2026-12-09", "23:55", "CHEM 181", "Homework", "Mastering HW due", "Mastering",
         "Due 11:55 PM (syllabus). From D2L schedule; HW number not recorded"),
    item("f011", "2026-11-10", "23:59", "INFO 579", "Assignment", "Unit 11 assignment due", "D2L", "Late not accepted"),
    item("f012", "2026-11-22", "23:59", "INFO 579", "Assignment", "Unit 12 assignment due", "D2L", "Late not accepted"),
    item("f013", "2026-11-29", "23:59", "INFO 579", "Assignment", "Unit 13 assignment due", "D2L", "Late not accepted"),
    item("f014", "2026-12-06", "23:59", "INFO 579", "Assignment", "Unit 14 assignment due", "D2L", "Late not accepted"),
    item("f015", "2026-12-13", "23:59", "INFO 579", "Assignment", "Unit 15 assignment due", "D2L", "Late not accepted"),
]

UPDATE = {
    "u002": dict(date="2026-11-13", time="23:59", type="Programming",
                 title="Programming 4: Sequence Processing (+ grad task)", location="GitHub Classroom + D2L",
                 notes="Push notebook to GitHub, upload to D2L"),
    "u003": dict(date="2026-11-13", time="23:59", title="PA4 quiz (+ grad task quiz)", location="D2L",
                 notes="Due with PA4 per D2L schedule"),
    "u004": dict(date="2026-12-04", time="23:59", type="Programming",
                 title="Programming 5: Pre-trained LMs (+ grad task)", location="GitHub Classroom + D2L",
                 notes="Quiz opens after submission"),
    "i012": dict(time="23:59", notes="11:59 PM per D2L schedule. Projects replace the final; late = max 70%"),
    "i014": dict(time="15:30", end="17:30", title="Final Exam (online window)", location="Online (D2L)",
                 notes="Available 3:30 PM, due 5:30 PM; availability ends 11:59 PM. Online, so no clash with MAT 231"),
}

REMOVE = {"u001", "u007"}


def main():
    if not os.path.exists(DATA):
        sys.exit(f"[patch] data.json not found at {DATA}")
    d = json.load(open(DATA, encoding="utf-8"))
    items = d["items"]
    ids = {i["id"] for i in items}
    log(f"loaded {DATA} · {len(items)} items · {sum(1 for i in items if i.get('done'))} done")

    before = len(items)
    items[:] = [i for i in items if i["id"] not in REMOVE]
    log(f"removed {before - len(items)} placeholder(s)")

    n_upd = 0
    for i in items:
        if i["id"] in UPDATE:
            i.update(UPDATE[i["id"]]); n_upd += 1        # `done` untouched
    log(f"updated {n_upd} of {len(UPDATE)} item(s)")

    n_add = 0
    for new in ADD:
        if new["id"] not in ids:
            items.append(new); n_add += 1
    log(f"added {n_add} new item(s) ({len(ADD) - n_add} already present)")

    items.sort(key=lambda i: (i["date"] or "9999", i["time"] or "00:00"))
    shutil.copy2(DATA, DATA + ".bak")
    tmp = DATA + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(d, fh, indent=2, ensure_ascii=False)
        fh.write("\n")
    os.replace(tmp, DATA)
    log(f"wrote data.json · {len(items)} items (backup: data.json.bak)")


if __name__ == "__main__":
    main()
