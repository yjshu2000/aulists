(function () {
  var script = document.currentScript;
  var direction = script.dataset.direction;
  var neighbor = script.dataset.neighbor;
  var label = script.dataset.label;

  var REVEAL_PX = 64;
  var COMMIT_PX = 48;
  var CANCEL_PX = 24;

  var margin = document.createElement('div');
  margin.className = 'swipe-nav-margin swipe-nav-' + direction;
  margin.innerHTML = '<span>' + label + '</span>';
  document.body.appendChild(margin);

  var state = 'rest';
  var startY = null;
  var revealedAtTouchStart = false;

  /**
   * Returns the page's current vertical scroll offset.
   * @returns {number} scroll offset in pixels.
   */
  function scrollTop() {
    return document.scrollingElement.scrollTop;
  }

  /**
   * Returns the maximum vertical scroll offset the page can reach.
   * @returns {number} max scroll offset in pixels.
   */
  function maxScrollTop() {
    return (document.scrollingElement.scrollHeight 
      - document.scrollingElement.clientHeight);
  }

  /**
   * Checks whether the page is scrolled to the edge this nav margin cares
   * about - the bottom for a "down" swipe target, the top for an "up" one -
   * since the gesture should only start from that edge.
   * @returns {boolean} true if at the relevant scroll boundary.
   */
  function atBoundary() {
    if (direction === 'up') {
      return scrollTop() >= maxScrollTop() - 1;
    }
    return scrollTop() <= 0;
  }

  /**
   * Positions the reveal margin at a given drag distance, sliding it in from
   * the edge that matches `direction`.
   * @param {number} dist - drag distance in pixels (0 = fully hidden,
   *   `REVEAL_PX` = fully revealed).
   */
  function setOffset(dist) {
    var hidden = REVEAL_PX - dist;
    var offset = -hidden;
    if (direction === 'up') {
      offset = hidden;
    }
    margin.style.transform = 'translateY(' + offset + 'px)';
  }

  /**
   * Resets the margin back to fully hidden and rest state.
   */
  function retract() {
    state = 'rest';
    setOffset(0);
  }

  document.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1) return;
    startY = e.touches[0].clientY;
    revealedAtTouchStart = state === 'revealed';
    if (state === 'rest' && !atBoundary()) {
      startY = null;
    }
  }, { passive: true });

  document.addEventListener('touchmove', function (e) {
    if (startY === null) return;
    var dy = e.touches[0].clientY - startY;
    var forward = dy > 0;
    if (direction === 'up') {
      forward = dy < 0;
    }
    var dist = Math.abs(dy);

    if (!forward) {
      if (state === 'revealed' && dist > CANCEL_PX) retract();
      return;
    }

    e.preventDefault();

    if (revealedAtTouchStart) {
      // this drag started already-revealed, so it's the second, separate
      //  swipe that commits
      if (dist >= COMMIT_PX) {
        location.href = neighbor;
      }
    } else {
      // this drag is the first swipe: it can only reveal, never commit, no
      //  matter how far or how long it holds
      setOffset(Math.min(dist, REVEAL_PX));
      if (dist >= REVEAL_PX) state = 'revealed';
    }
  }, { passive: false });

  document.addEventListener('touchend', function () {
    startY = null;
    if (state === 'revealed') setOffset(REVEAL_PX);
  });

  setOffset(0);
})();
