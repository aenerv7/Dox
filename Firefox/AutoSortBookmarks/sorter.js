"use strict";

(function exposeBookmarkSorter(globalScope) {
  const collator = new Intl.Collator("en", {
    caseFirst: "upper",
    numeric: true,
    sensitivity: "variant",
    usage: "sort",
  });

  function normalized(value) {
    return String(value ?? "").normalize("NFKC");
  }

  function isBookmark(node) {
    if (node.type) {
      return node.type === "bookmark";
    }

    return typeof node.url === "string";
  }

  function isFolder(node) {
    if (node.type) {
      return node.type === "folder";
    }

    return typeof node.url !== "string";
  }

  function isSeparator(node) {
    return node.type === "separator";
  }

  function compareFolders(left, right) {
    const leftTitle = normalized(left.title);
    const rightTitle = normalized(right.title);

    return (
      collator.compare(leftTitle, rightTitle) ||
      collator.compare(normalized(left.id), normalized(right.id))
    );
  }

  function compareBookmarks(left, right) {
    const leftTitle = normalized(left.title);
    const rightTitle = normalized(right.title);
    const leftUrl = normalized(left.url);
    const rightUrl = normalized(right.url);

    return (
      collator.compare(leftTitle, rightTitle) ||
      collator.compare(leftUrl, rightUrl) ||
      collator.compare(normalized(left.id), normalized(right.id))
    );
  }

  function sortSegment(segment) {
    const folders = segment.filter(isFolder).sort(compareFolders);
    const bookmarks = segment.filter(isBookmark).sort(compareBookmarks);
    const otherNodes = segment.filter(
      node => !isFolder(node) && !isBookmark(node),
    );

    return [...folders, ...bookmarks, ...otherNodes];
  }

  function buildDesiredChildren(children) {
    const desiredChildren = [];
    let segment = [];

    for (const child of children) {
      if (!isSeparator(child)) {
        segment.push(child);
        continue;
      }

      desiredChildren.push(...sortSegment(segment), child);
      segment = [];
    }

    desiredChildren.push(...sortSegment(segment));
    return desiredChildren;
  }

  /**
   * Sorts one folder in separator-delimited segments. Folders are placed first
   * and sorted by title, followed by bookmarks sorted by title and then URL.
   *
   * @param {object} bookmarksApi browser.bookmarks or a compatible test double.
   * @param {string} folderId ID of the folder to sort.
   * @param {Array<object>} children Current children of the folder.
   * @returns {Promise<number>} Number of move operations performed.
   */
  async function sortFolderContents(bookmarksApi, folderId, children) {
    const desiredChildren = buildDesiredChildren(children);
    const currentIds = children.map(child => child.id);
    let moveCount = 0;

    for (let index = 0; index < desiredChildren.length; index += 1) {
      const desiredChild = desiredChildren[index];

      if (currentIds[index] === desiredChild.id) {
        continue;
      }

      const currentIndex = currentIds.indexOf(desiredChild.id);

      await bookmarksApi.move(desiredChild.id, {
        index,
        parentId: folderId,
      });

      currentIds.splice(currentIndex, 1);
      currentIds.splice(index, 0, desiredChild.id);
      moveCount += 1;
    }

    return moveCount;
  }

  /**
   * Recursively sorts all folder contents below a root folder.
   *
   * @param {object} bookmarksApi browser.bookmarks or a compatible test double.
   * @param {string} folderId ID of the root folder for this traversal.
   * @returns {Promise<{folderCount: number, moveCount: number}>}
   */
  async function sortFolderRecursively(bookmarksApi, folderId) {
    const children = await bookmarksApi.getChildren(folderId);
    const childFolders = children.filter(isFolder);
    let moveCount = await sortFolderContents(
      bookmarksApi,
      folderId,
      children,
    );
    let folderCount = 1;

    for (const folder of childFolders) {
      const result = await sortFolderRecursively(bookmarksApi, folder.id);
      moveCount += result.moveCount;
      folderCount += result.folderCount;
    }

    return { folderCount, moveCount };
  }

  async function sortRoots(bookmarksApi, rootIds) {
    let folderCount = 0;
    let moveCount = 0;

    for (const rootId of rootIds) {
      const result = await sortFolderRecursively(bookmarksApi, rootId);
      folderCount += result.folderCount;
      moveCount += result.moveCount;
    }

    return { folderCount, moveCount };
  }

  const BookmarkSorter = Object.freeze({
    compareBookmarks,
    compareFolders,
    buildDesiredChildren,
    isBookmark,
    isFolder,
    isSeparator,
    sortFolderContents,
    sortFolderRecursively,
    sortRoots,
  });

  globalScope.BookmarkSorter = BookmarkSorter;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = BookmarkSorter;
  }
})(globalThis);
