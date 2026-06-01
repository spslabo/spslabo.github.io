// Client-side filtering for the Grafana Feature Tracker table.
// Filters rows by free-text (name or description) and by stage.
(function () {
  var q = document.getElementById('ff-search');
  var sel = document.getElementById('ff-stage');
  var count = document.getElementById('ff-count');
  var table = document.getElementById('ff-table');
  if (!q || !sel || !table) {
    return;
  }
  var rows = Array.prototype.slice.call(table.querySelectorAll('tbody tr'));

  function apply() {
    var text = (q.value || '').toLowerCase();
    var stage = sel.value;
    var shown = 0;
    rows.forEach(function (row) {
      var okStage = !stage || row.getAttribute('data-stage') === stage;
      var okText = !text ||
        row.getAttribute('data-name').indexOf(text) > -1 ||
        row.textContent.toLowerCase().indexOf(text) > -1;
      var visible = okStage && okText;
      row.style.display = visible ? '' : 'none';
      if (visible) {
        shown++;
      }
    });
    if (count) {
      count.textContent = shown;
    }
  }

  q.addEventListener('input', apply);
  sel.addEventListener('change', apply);
  apply();
})();
