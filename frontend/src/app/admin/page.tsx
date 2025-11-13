"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { fetchUsers, createUser, deleteUser, type UserInfo } from "@/lib/apiClient";

type TabType = "users" | "register";

export default function AdminPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabType>("register");
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);

  // Create user form
  const [newEmail, setNewEmail] = useState("");
  const [newCompanyName, setNewCompanyName] = useState("");
  const [createdPassword, setCreatedPassword] = useState("");
  const [createLoading, setCreateLoading] = useState(false);

  useEffect(() => {
    const accessToken = localStorage.getItem("access_token");
    const userInfo = localStorage.getItem("user_info");

    if (!accessToken || !userInfo) {
      router.push("/login");
      return;
    }

    const parsed = JSON.parse(userInfo);
    if (!parsed.is_admin) {
      router.push("/");
      return;
    }

    setToken(accessToken);
    setIsAdmin(true);
    loadUsers(accessToken);
  }, [router]);

  const loadUsers = async (accessToken: string) => {
    try {
      const data = await fetchUsers(accessToken);
      setUsers(data);
    } catch (err) {
      setError("ユーザー一覧の取得に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;

    setError("");
    setCreateLoading(true);
    setCreatedPassword("");

    try {
      const response = await createUser(
        { email: newEmail, company_name: newCompanyName },
        token
      );

      setCreatedPassword(response.initial_password);
      setNewEmail("");
      setNewCompanyName("");
      await loadUsers(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ユーザーの作成に失敗しました");
    } finally {
      setCreateLoading(false);
    }
  };

  const handleDeleteUser = async (userId: number) => {
    if (!token) return;
    if (!confirm("本当にこのユーザーを削除しますか？")) return;

    try {
      await deleteUser(userId, token);
      await loadUsers(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ユーザーの削除に失敗しました");
    }
  };

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-white shadow-sm border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <h1 className="text-xl font-bold text-slate-900">管理者画面</h1>
            <button
              onClick={() => router.push("/")}
              className="text-sm text-indigo-600 hover:text-indigo-700 font-medium"
            >
              ホームに戻る
            </button>
          </div>
        </div>
      </nav>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tab Navigation */}
        <div className="mb-6 border-b border-slate-200">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => setActiveTab("register")}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === "register"
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
              }`}
            >
              利用者登録
            </button>
            <button
              onClick={() => setActiveTab("users")}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === "users"
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300"
              }`}
            >
              ユーザー管理
            </button>
          </nav>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* Register Tab */}
        {activeTab === "register" && (
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-2">新規利用者登録</h2>
            <p className="text-sm text-slate-600 mb-8">
              新しいユーザーを登録して、初回パスワードを発行します
            </p>

            <form onSubmit={handleCreateUser} className="space-y-6 max-w-2xl">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  メールアドレス <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  required
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                  placeholder="user@company.com"
                />
                <p className="mt-1 text-xs text-slate-500">
                  このメールアドレスでログインします
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  会社名 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newCompanyName}
                  onChange={(e) => setNewCompanyName(e.target.value)}
                  required
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition"
                  placeholder="株式会社サンプル"
                />
              </div>

              <button
                type="submit"
                disabled={createLoading}
                className="w-full px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-semibold rounded-lg transition duration-200 shadow-lg hover:shadow-xl"
              >
                {createLoading ? "登録中..." : "利用者を登録"}
              </button>
            </form>

            {createdPassword && (
              <div className="mt-8 p-6 bg-green-50 border-2 border-green-200 rounded-xl">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0">
                    <svg
                      className="h-6 w-6 text-green-600"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                      />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-green-900 mb-2">
                      利用者を登録しました
                    </h3>
                    <p className="text-sm text-green-800 mb-4">
                      以下の初回パスワードを依頼主に共有してください。
                      <br />
                      初回ログイン後、ユーザーは新しいパスワードに変更する必要があります。
                    </p>
                    <div className="bg-white border-2 border-green-300 px-4 py-3 rounded-lg">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-lg font-semibold text-slate-900">
                          {createdPassword}
                        </span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(createdPassword);
                            alert("パスワードをクリップボードにコピーしました");
                          }}
                          className="ml-4 px-4 py-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg transition"
                        >
                          コピー
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Users Management Tab */}
        {activeTab === "users" && (
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-slate-900">登録ユーザー一覧</h2>
              <p className="text-sm text-slate-600 mt-1">
                登録されているすべてのユーザーを表示します
              </p>
            </div>

            {loading && users.length === 0 ? (
              <div className="text-center py-12 text-slate-500">読み込み中...</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">
                        ID
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">
                        メールアドレス
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">
                        会社名
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">
                        権限
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">
                        パスワード変更
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">
                        登録日
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-slate-700 uppercase">
                        操作
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {users.map((user) => (
                      <tr key={user.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3 text-sm text-slate-900">{user.id}</td>
                        <td className="px-4 py-3 text-sm text-slate-900">{user.email}</td>
                        <td className="px-4 py-3 text-sm text-slate-900">{user.company_name}</td>
                        <td className="px-4 py-3 text-sm">
                          {user.is_admin ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                              管理者
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800">
                              一般
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {user.requires_password_change ? (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                              要変更
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                              変更済み
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600">
                          {new Date(user.created_at).toLocaleDateString("ja-JP")}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          {!user.is_admin && (
                            <button
                              onClick={() => handleDeleteUser(user.id)}
                              className="text-red-600 hover:text-red-700 font-medium"
                            >
                              削除
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
