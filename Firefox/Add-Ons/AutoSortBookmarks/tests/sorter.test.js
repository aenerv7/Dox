"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildDesiredChildren,
  compareBookmarks,
  compareFolders,
  sortFolderContents,
  sortRoots,
} = require("../sorter.js");

function bookmark(id, title, url) {
  return { id, title, type: "bookmark", url };
}

function folder(id, title) {
  return { id, title, type: "folder" };
}

function separator(id) {
  return { id, title: "", type: "separator" };
}

function createBookmarksApi(folders) {
  const childLists = new Map(
    Object.entries(folders).map(([id, children]) => [id, [...children]]),
  );
  const moves = [];

  return {
    childLists,
    moves,
    async getChildren(folderId) {
      const children = childLists.get(folderId);
      if (!children) {
        throw new Error(`Unknown folder: ${folderId}`);
      }
      return children.map((child, index) => ({ ...child, index }));
    },
    async move(id, destination) {
      const children = childLists.get(destination.parentId);
      const oldIndex = children.findIndex(child => child.id === id);
      assert.notEqual(oldIndex, -1, `Missing bookmark ${id}`);

      const [item] = children.splice(oldIndex, 1);
      children.splice(destination.index, 0, item);
      moves.push({ id, ...destination });
      return { ...item, index: destination.index };
    },
  };
}

function permutations(items) {
  if (items.length < 2) {
    return [items];
  }

  return items.flatMap((item, index) =>
    permutations(items.filter((_, itemIndex) => itemIndex !== index)).map(
      remainder => [item, ...remainder],
    ),
  );
}

test("compares by title first and URL second", () => {
  const items = [
    bookmark("3", "Beta", "https://a.example/"),
    bookmark("2", "Alpha", "https://z.example/"),
    bookmark("1", "Alpha", "https://a.example/"),
  ];

  assert.deepEqual(items.sort(compareBookmarks).map(item => item.id), [
    "1",
    "2",
    "3",
  ]);
});

test("uses natural A-Z ordering", () => {
  const items = [
    bookmark("10", "Page 10", "https://example/10"),
    bookmark("2", "page 2", "https://example/2"),
    bookmark("1", "Álpha", "https://example/1"),
  ];

  assert.deepEqual(items.sort(compareBookmarks).map(item => item.id), [
    "1",
    "2",
    "10",
  ]);
});

test("distinguishes title case and accents before comparing URLs", () => {
  const items = [
    bookmark("accent-lower", "álpha", "https://a.example/"),
    bookmark("lower", "alpha", "https://a.example/"),
    bookmark("accent-upper", "Álpha", "https://a.example/"),
    bookmark("upper", "Alpha", "https://z.example/"),
  ];

  assert.deepEqual(items.sort(compareBookmarks).map(item => item.id), [
    "upper",
    "lower",
    "accent-upper",
    "accent-lower",
  ]);
});

test("sorts folders by title using natural A-Z ordering", () => {
  const folders = [
    folder("10", "Folder 10"),
    folder("2", "folder 2"),
    folder("1", "Álpha"),
  ];

  assert.deepEqual(folders.sort(compareFolders).map(item => item.id), [
    "1",
    "2",
    "10",
  ]);
});

test("sorts folders before bookmarks inside each separator-delimited segment", async () => {
  const api = createBookmarksApi({
    root: [
      bookmark("z", "Zulu", "https://z.example/"),
      folder("folder-b", "Beta folder"),
      bookmark("b", "Alpha", "https://b.example/"),
      folder("folder-a", "Alpha folder"),
      separator("separator"),
      bookmark("z-2", "Zulu", "https://z.example/2"),
      folder("folder-c", "Charlie folder"),
      bookmark("a-2", "Alpha", "https://a.example/2"),
    ],
  });

  const original = await api.getChildren("root");
  const moveCount = await sortFolderContents(api, "root", original);

  assert.equal(moveCount, 5);
  assert.deepEqual(api.childLists.get("root").map(item => item.id), [
    "folder-a",
    "folder-b",
    "b",
    "z",
    "separator",
    "folder-c",
    "a-2",
    "z-2",
  ]);
  assert.ok(api.moves.every(move => move.id !== "separator"));
});

test("keeps separators fixed and respects segment boundaries for every permutation", async () => {
  const items = [
    bookmark("c", "Charlie", "https://c.example/"),
    bookmark("a", "Alpha", "https://a.example/"),
    bookmark("b", "Bravo", "https://b.example/"),
    folder("folder", "Folder"),
    separator("separator"),
  ];

  for (const arrangement of permutations(items)) {
    const expectedSeparatorIndex = arrangement.findIndex(
      item => item.id === "separator",
    );
    const expectedIds = buildDesiredChildren(arrangement).map(item => item.id);
    const api = createBookmarksApi({ root: arrangement });

    await sortFolderContents(
      api,
      "root",
      await api.getChildren("root"),
    );

    const sorted = api.childLists.get("root");
    assert.equal(sorted[expectedSeparatorIndex].id, "separator");
    assert.deepEqual(sorted.map(item => item.id), expectedIds);
    assert.ok(api.moves.every(move => move.id !== "separator"));
  }
});

test("recursively sorts both requested roots", async () => {
  const api = createBookmarksApi({
    menu: [
      bookmark("menu-z", "Zulu", "https://z.example/"),
      folder("nested", "Nested"),
      bookmark("menu-a", "Alpha", "https://a.example/"),
    ],
    nested: [
      bookmark("nested-z", "Zulu", "https://z.example/nested"),
      bookmark("nested-a", "Alpha", "https://a.example/nested"),
    ],
    other: [
      bookmark("other-z", "Zulu", "https://z.example/other"),
      bookmark("other-a", "Alpha", "https://a.example/other"),
    ],
  });

  const result = await sortRoots(api, ["menu", "other"]);

  assert.deepEqual(result, { folderCount: 3, moveCount: 4 });
  assert.deepEqual(api.childLists.get("menu").map(item => item.id), [
    "nested",
    "menu-a",
    "menu-z",
  ]);
  assert.deepEqual(api.childLists.get("nested").map(item => item.id), [
    "nested-a",
    "nested-z",
  ]);
  assert.deepEqual(api.childLists.get("other").map(item => item.id), [
    "other-a",
    "other-z",
  ]);
});
