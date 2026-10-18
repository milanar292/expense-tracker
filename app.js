(function () {
    "use strict";

    const DEFAULT_CATEGORIES = ["food", "transport", "rent", "utilities", "groceries", "other"];
    let categories = [];
    let expenses = [];
    let trendChart = null;
    let catChart = null;

    function load() {
        try { categories = JSON.parse(localStorage.getItem("categories")) || DEFAULT_CATEGORIES.slice(); }
        catch (e) { categories = DEFAULT_CATEGORIES.slice(); }
        try { expenses = JSON.parse(localStorage.getItem("expenses")) || []; }
        catch (e) { expenses = []; }
        if (!Array.isArray(categories)) categories = DEFAULT_CATEGORIES.slice();
        if (!Array.isArray(expenses)) expenses = [];
    }

    function save() {
        localStorage.setItem("categories", JSON.stringify(categories));
        localStorage.setItem("expenses", JSON.stringify(expenses));
    }

    function uid() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    }

    function today() {
        return new Date().toISOString().slice(0, 10);
    }

    function fmt(n) {
        return "₹" + Number(n).toFixed(2);
    }

    function totals(list) {
        let credited = 0, spent = 0;
        for (const e of list) {
            const amt = Number(e.amount) || 0;
            if (e.type === "credit") credited += amt;
            else spent += amt;
        }
        return { credited: credited, spent: spent, balance: credited - spent };
    }

    function monthKey(offsetMonths) {
        const now = new Date();
        return now.getFullYear() + "-" + String(now.getMonth() + 1 + (offsetMonths || 0)).padStart(2, "0");
    }

    function lastNMonthKeys(n) {
        const keys = [];
        for (let i = n - 1; i >= 0; i--) {
            const d = new Date();
            d.setDate(1);
            d.setMonth(d.getMonth() - i);
            keys.push(d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"));
        }
        return keys;
    }

    function renderCategorySelect() {
        const s = document.getElementById("expenseCategory");
        s.innerHTML = "";
        categories.forEach(function (c) {
            const o = document.createElement("option");
            o.value = c;
            o.textContent = c;
            s.appendChild(o);
        });
    }

    function renderCategoryList() {
        const d = document.getElementById("categoriesList");
        d.innerHTML = "";
        categories.forEach(function (c) {
            const div = document.createElement("div");
            div.className = "category-tag";
            const label = document.createElement("span");
            label.textContent = c;
            const btn = document.createElement("button");
            btn.type = "button";
            btn.textContent = "×";
            btn.setAttribute("aria-label", "Delete category " + c);
            btn.addEventListener("click", function () {
                if (confirm("Delete category \"" + c + "\"?")) {
                    categories = categories.filter(function (x) { return x !== c; });
                    save();
                    renderCategorySelect();
                    renderCategoryList();
                }
            });
            div.appendChild(label);
            div.appendChild(btn);
            d.appendChild(div);
        });
    }

    function renderSummary() {
        const all = totals(expenses);
        const thisMonth = totals(expenses.filter(function (e) { return String(e.date).slice(0, 7) === monthKey(0); }));
        document.getElementById("balance").textContent = fmt(all.balance);
        document.getElementById("monthTotal").textContent = fmt(thisMonth.spent);
        document.getElementById("totalSpent").textContent = fmt(all.spent);
        document.getElementById("totalCredited").textContent = fmt(all.credited);
    }

    function renderExpenseTable() {
        const m = document.getElementById("monthFilter").value;
        let list = expenses.slice();
        if (m) list = list.filter(function (e) { return String(e.date).slice(0, 7) === m; });
        list.sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
        const tb = document.querySelector("#expensesTable tbody");
        tb.innerHTML = "";
        if (list.length === 0) {
            const tr = document.createElement("tr");
            const td = document.createElement("td");
            td.colSpan = 5;
            td.style.color = "#7f8c8d";
            td.textContent = "No expenses recorded";
            tr.appendChild(td);
            tb.appendChild(tr);
            return;
        }
        list.forEach(function (e) {
            const tr = document.createElement("tr");

            const dateTd = document.createElement("td");
            dateTd.textContent = e.date;

            const amtTd = document.createElement("td");
            amtTd.style.color = e.type === "credit" ? "#27ae60" : "#e74c3c";
            amtTd.style.fontWeight = "bold";
            amtTd.textContent = (e.type === "credit" ? "+₹" : "-₹") + (Number(e.amount) || 0).toFixed(2);

            const catTd = document.createElement("td");
            catTd.textContent = e.category || "";

            const descTd = document.createElement("td");
            descTd.textContent = e.desc || "";

            const delTd = document.createElement("td");
            const delBtn = document.createElement("button");
            delBtn.className = "delete-btn";
            delBtn.type = "button";
            delBtn.textContent = "Del";
            delBtn.addEventListener("click", function () {
                if (confirm("Delete this " + e.type + " of " + fmt(e.amount) + "?")) {
                    expenses = expenses.filter(function (x) { return x.id !== e.id; });
                    save();
                    renderAll();
                }
            });
            delTd.appendChild(delBtn);

            tr.appendChild(dateTd);
            tr.appendChild(amtTd);
            tr.appendChild(catTd);
            tr.appendChild(descTd);
            tr.appendChild(delTd);
            tb.appendChild(tr);
        });
    }

    function renderStats() {
        const statMonth = document.getElementById("statMonth").value;
        const by = {};
        const monthExpenses = expenses.filter(function (e) {
            return e.type === "expense" && (!statMonth || String(e.date).slice(0, 7) === statMonth);
        });
        monthExpenses.forEach(function (e) {
            by[e.category] = (by[e.category] || 0) + (Number(e.amount) || 0);
        });
        const total = monthExpenses.reduce(function (a, b) { return a + (Number(b.amount) || 0); }, 0);

        const hist = lastNMonthKeys(6).map(function (key) {
            return {
                m: key,
                t: expenses.filter(function (e) {
                    return e.type === "expense" && String(e.date).slice(0, 7) === key;
                }).reduce(function (a, b) { return a + (Number(b.amount) || 0); }, 0)
            };
        });

        drawTrend(hist);
        drawCat(by, total);
    }

    function drawTrend(hist) {
        const c = document.getElementById("trendChart").getContext("2d");
        if (trendChart) trendChart.destroy();
        trendChart = new Chart(c, {
            type: "line",
            data: {
                labels: hist.map(function (x) { return x.m; }),
                datasets: [{
                    data: hist.map(function (x) { return x.t; }),
                    borderColor: "#e74c3c",
                    backgroundColor: "rgba(231,76,60,0.1)",
                    fill: true,
                    tension: 0.3
                }]
            },
            options: {
                responsive: true,
                plugins: { legend: { display: false } },
                scales: { y: { beginAtZero: true, ticks: { callback: function (v) { return "₹" + v; } } } }
            }
        });
    }

    function drawCat(by, total) {
        const c = document.getElementById("catChart").getContext("2d");
        if (catChart) catChart.destroy();
        const keys = Object.keys(by);
        const vals = Object.values(by);
        const colors = ["#e74c3c", "#3498db", "#2ecc71", "#f39c12", "#9b59b6", "#1abc9c", "#e67e22", "#34495e"];
        catChart = new Chart(c, {
            type: "doughnut",
            data: {
                labels: keys,
                datasets: [{ data: vals, backgroundColor: colors.slice(0, Math.max(keys.length, 1)).slice(0, keys.length) }]
            },
            options: {
                responsive: true,
                plugins: { legend: { position: "right" } }
            }
        });
        const el = document.getElementById("byCategory");
        el.innerHTML = "";
        if (keys.length === 0) {
            el.textContent = "No expenses for this month";
            el.style.color = "#7f8c8d";
            return;
        }
        el.style.color = "";
        Object.entries(by).sort(function (a, b) { return b[1] - a[1]; }).forEach(function (entry) {
            const k = entry[0], v = entry[1];
            const p = total ? (v / total * 100).toFixed(1) : "0.0";
            const div = document.createElement("div");
            div.className = "by-category-item";
            const left = document.createElement("span");
            left.textContent = k + " (" + p + "%)";
            const right = document.createElement("span");
            right.className = "amount";
            right.textContent = fmt(v);
            div.appendChild(left);
            div.appendChild(right);
            el.appendChild(div);
        });
    }

    function renderAll() {
        renderSummary();
        renderExpenseTable();
        renderStats();
    }

    function buildMonthFilter() {
        const mf = document.getElementById("monthFilter");
        mf.innerHTML = "";
        const all = document.createElement("option");
        all.value = "";
        all.textContent = "All";
        mf.appendChild(all);
        lastNMonthKeys(12).reverse().forEach(function (key) {
            const o = document.createElement("option");
            o.value = key;
            o.textContent = key;
            mf.appendChild(o);
        });
    }

    function buildStatMonth() {
        const sm = document.getElementById("statMonth");
        sm.innerHTML = "";
        lastNMonthKeys(6).reverse().forEach(function (key, i) {
            const o = document.createElement("option");
            o.value = key;
            o.textContent = key;
            if (i === 0) o.selected = true;
            sm.appendChild(o);
        });
    }

    function exportData() {
        const payload = {
            app: "expense-tracker",
            version: 1,
            exportedAt: new Date().toISOString(),
            categories: categories,
            expenses: expenses
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "expense-tracker-backup-" + today() + ".json";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
    }

    function importData(file) {
        const reader = new FileReader();
        reader.onload = function () {
            let parsed;
            try { parsed = JSON.parse(reader.result); }
            catch (e) { alert("Could not read that file as JSON."); return; }
            if (!parsed || !Array.isArray(parsed.expenses) || !Array.isArray(parsed.categories)) {
                alert("That file does not look like an Expense Tracker backup.");
                return;
            }
            if (!confirm("Import " + parsed.expenses.length + " entries? This replaces all current data on this device.")) return;
            categories = parsed.categories.filter(function (c) { return typeof c === "string"; });
            expenses = parsed.expenses.filter(function (e) {
                return e && typeof e.date === "string" && !isNaN(Number(e.amount));
            }).map(function (e) {
                return {
                    id: e.id || uid(),
                    date: e.date,
                    amount: Number(e.amount),
                    category: e.category || "other",
                    desc: e.desc || "",
                    type: e.type === "credit" ? "credit" : "expense"
                };
            });
            if (categories.length === 0) categories = DEFAULT_CATEGORIES.slice();
            save();
            buildMonthFilter();
            buildStatMonth();
            renderCategorySelect();
            renderCategoryList();
            renderAll();
            alert("Backup imported successfully.");
        };
        reader.readAsText(file);
    }

    function setupInstallPrompt() {
        const installBtn = document.getElementById("installBtn");
        let deferredPrompt = null;
        window.addEventListener("beforeinstallprompt", function (e) {
            e.preventDefault();
            deferredPrompt = e;
            installBtn.hidden = false;
        });
        installBtn.addEventListener("click", function () {
            if (!deferredPrompt) return;
            deferredPrompt.prompt();
            deferredPrompt.userChoice.finally(function () {
                deferredPrompt = null;
                installBtn.hidden = true;
            });
        });
        window.addEventListener("appinstalled", function () {
            installBtn.hidden = true;
        });
        if (/iPad|iPhone|iPod/.test(navigator.userAgent) && !window.navigator.standalone) {
            document.getElementById("iosHint").hidden = false;
        }
    }

    function init() {
        load();
        buildMonthFilter();
        buildStatMonth();
        renderCategorySelect();
        renderCategoryList();
        renderAll();
        setupInstallPrompt();

        document.getElementById("expenseDate").value = today();

        document.getElementById("creditForm").addEventListener("submit", function (e) {
            e.preventDefault();
            expenses.push({
                id: uid(),
                date: today(),
                amount: parseFloat(document.getElementById("creditAmount").value),
                category: "CREDIT",
                desc: document.getElementById("creditNote").value.trim(),
                type: "credit"
            });
            save();
            e.target.reset();
            renderAll();
        });

        document.getElementById("expenseForm").addEventListener("submit", function (e) {
            e.preventDefault();
            expenses.push({
                id: uid(),
                date: document.getElementById("expenseDate").value,
                amount: parseFloat(document.getElementById("expenseAmount").value),
                category: document.getElementById("expenseCategory").value,
                desc: document.getElementById("expenseDesc").value.trim(),
                type: "expense"
            });
            save();
            e.target.reset();
            document.getElementById("expenseDate").value = today();
            renderAll();
        });

        document.getElementById("categoryForm").addEventListener("submit", function (e) {
            e.preventDefault();
            const input = document.getElementById("categoryName");
            const name = input.value.trim().toLowerCase();
            if (name && !categories.some(function (c) { return c.toLowerCase() === name; })) {
                categories.push(name);
                save();
                renderCategorySelect();
                renderCategoryList();
            }
            input.value = "";
        });

        document.getElementById("monthFilter").addEventListener("change", renderExpenseTable);
        document.getElementById("statMonth").addEventListener("change", renderStats);
        document.getElementById("exportBtn").addEventListener("click", exportData);
        document.getElementById("importBtn").addEventListener("click", function () {
            document.getElementById("importFile").click();
        });
        document.getElementById("importFile").addEventListener("change", function (e) {
            if (e.target.files && e.target.files[0]) {
                importData(e.target.files[0]);
                e.target.value = "";
            }
        });
    }

    window.addEventListener("DOMContentLoaded", init);
})();
