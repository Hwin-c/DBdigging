/**
 * scripts/verify_phase13_steps.ts
 *
 * Phase 13 후반부 (Step 13-2 ~ Step 13-5) 단위 및 통합 검증 스크립트
 * 실제 번들(public/data/firebase_graph_bundle.json) 및 데일리 시드 100개를 로드하여 검증
 */

import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import { GraphStore } from "../src/lib/graph/loader";
import { GraphEngine } from "../src/lib/graph/engine";
import { RawGraphBundle, DailyQuestSeed } from "../src/lib/graph/types";
import {
  checkInstantConnectivity,
  diagnoseQuestPair,
  generateCustomQuest,
  findSimilarSongsInComponent,
  extractMissingRolesOnShortestPath
} from "../src/lib/game/quest";
import { searchSongsAndPersons } from "../src/lib/game/search";

async function runTests() {
  const rootDir = process.cwd();
  const dataDir = path.join(rootDir, "public", "data");

  console.log("=== [Phase 13 Verification Suite] Loading Graph Bundle & Seeds ===");
  const bundle: RawGraphBundle = JSON.parse(
    fs.readFileSync(path.join(dataDir, "firebase_graph_bundle.json"), "utf-8")
  );
  const seeds: DailyQuestSeed[] = JSON.parse(
    fs.readFileSync(path.join(dataDir, "firebase_daily_quests_seed.json"), "utf-8")
  );

  const store = new GraphStore();
  store.populate(bundle);
  const engine = new GraphEngine(store);

  // 전역 싱글톤 주입 (quest.ts, search.ts 등에서 참조)
  globalThis.__dbdigging_graph_singleton__ = store;
  globalThis.__dbdigging_engine_singleton__ = engine;

  console.log(`Bundle loaded in ${store.loadDurationMs}ms (Songs: ${store.songs.size}, Persons: ${store.persons.size})`);

  // =========================================================================
  // 1. Step 13-2 검증: 5종 가상 ID, 비인물 차단, 후보 2 가중치 최단 경로
  // =========================================================================
  console.log("\n[Test 1] Step 13-2: 5 Virtual ID Prefixes & Safe Merge (including artist_)");
  assert.strictEqual(engine.isVirtualPersonId("singer_나훈아"), true);
  assert.strictEqual(engine.isVirtualPersonId("name_김창완"), true);
  assert.strictEqual(engine.isVirtualPersonId("feat_Dok2"), true);
  assert.strictEqual(engine.isVirtualPersonId("group_SHINee (샤이니)"), true);
  assert.strictEqual(engine.isVirtualPersonId("artist_김창완"), true);
  assert.strictEqual(engine.isVirtualPersonId("artist_김현호"), true);
  assert.strictEqual(engine.isVirtualPersonId("751"), false);
  assert.strictEqual(engine.isVirtualPersonId("1"), false);

  // 김창완(751) 병합 목록에 artist_김창완 포함 확인
  const mergedKim = engine.getSafeMergedPersonIds("751");
  assert.ok(mergedKim.includes("751"), "Must include formal ID 751");
  assert.ok(mergedKim.includes("artist_김창완"), "Must include artist_김창완");
  assert.ok(mergedKim.includes("singer_김창완"), "Must include singer_김창완");
  assert.ok(mergedKim.includes("name_김창완"), "Must include name_김창완");
  assert.ok(mergedKim.includes("feat_김창완"), "Must include feat_김창완");
  console.log("  -> PASS: 김창완(751) merged IDs:", mergedKim);

  console.log("\n[Test 2] Step 13-2: Non-Person Node Blocking ('name_미상', 'name_작자미상', '611339')");
  assert.strictEqual(engine.isBlockedNonPersonId("name_미상"), true);
  assert.strictEqual(engine.isBlockedNonPersonId("name_작자미상"), true);
  assert.strictEqual(engine.isBlockedNonPersonId("611339"), true);
  assert.strictEqual(engine.isBlockedNonPersonId("751"), false);
  assert.deepStrictEqual(engine.getConnectedSongs("name_미상"), []);
  assert.deepStrictEqual(engine.getConnectedSongs("name_작자미상"), []);
  assert.deepStrictEqual(engine.getConnectedSongs("611339"), []);

  // name_미상이 연결된 곡에서 getConnectedPersons 호출 시 '미상'이 노출되지 않는지 확인
  const unknownSongs = store.personToSongs.get("name_미상") || [];
  assert.ok(unknownSongs.length > 0, "Bundle has songs linked to name_미상");
  const sampleUnknownSongId = unknownSongs[0][0];
  const connectedPersonsForSample = engine.getConnectedPersons(sampleUnknownSongId);
  assert.ok(
    connectedPersonsForSample.every((p) => !engine.isBlockedNonPersonId(p.id) && p.name !== "미상"),
    "Blocked non-person nodes must not appear in getConnectedPersons()"
  );

  // 검색 결과에서도 비인물('미상', '작자미상') 인물 노드가 제외되는지 확인
  const personSearchMisang = searchSongsAndPersons("작자미상", { type: "person", limit: 20 });
  assert.ok(
    personSearchMisang.every((item) => !engine.isBlockedNonPersonId(item.id)),
    "Blocked non-person nodes must not appear in person search results"
  );
  console.log("  -> PASS: Non-person nodes blocked in getConnectedPersons, getConnectedSongs, and search");

  console.log("\n[Test 3] Step 13-2: Candidate 2 (Weighted Penalty on Virtual IDs) on 100 Daily Seeds");
  const tSeedsStart = performance.now();
  let reachableSeeds = 0;
  let pureFormalSeeds = 0;
  for (const seed of seeds) {
    const sp = engine.findShortestPath(seed.start_song_id, seed.target_song_id);
    assert.strictEqual(sp.found, true, `Seed ${seed.quest_id} must be reachable`);
    reachableSeeds++;

    // 경로 상에 비인물 노드가 절대 포함되지 않았는지 검증
    const personSteps = sp.typedPath
      .filter((k) => k.startsWith("p:"))
      .map((k) => k.slice(2));
    for (const pid of personSteps) {
      assert.strictEqual(
        engine.isBlockedNonPersonId(pid),
        false,
        `Path must not contain blocked non-person node ${pid}`
      );
    }

    const hasVirtual = personSteps.some((pid) => engine.isVirtualPersonId(pid));
    if (!hasVirtual) {
      pureFormalSeeds++;
    }
  }
  const seedsElapsedMs = performance.now() - tSeedsStart;
  assert.strictEqual(reachableSeeds, 100, "All 100 daily seeds must be reachable");
  assert.ok(
    pureFormalSeeds >= 98,
    `Expected at least 98/100 pure formal ID paths (matching spec_entity_resolution.md), got ${pureFormalSeeds}`
  );
  console.log(
    `  -> PASS: Daily seeds reachability = ${reachableSeeds}/100, pure formal ID paths = ${pureFormalSeeds}/100 in ${seedsElapsedMs.toFixed(1)}ms`
  );

  // =========================================================================
  // 2. Step 13-3 검증: Layer 1 실시간 O(1) 연결성 뱃지 & Layer 2 3대 실패 원인
  // =========================================================================
  console.log("\n[Test 4] Step 13-3 Layer 1: O(1) store.getComponentId(songId) Performance & Accuracy");
  const giantSongs = store.getComponentSongs(1);
  const comp2Songs = store.getComponentSongs(2);
  assert.ok(giantSongs.length > 190000, `Giant component (#1) has ${giantSongs.length} songs`);
  assert.ok(comp2Songs.length > 100, `Component #2 has ${comp2Songs.length} songs`);

  const songGiantA = giantSongs[0];
  const songGiantB = giantSongs[100];
  const songIsland2 = comp2Songs[0];

  const t0 = performance.now();
  for (let i = 0; i < 10000; i++) {
    store.getComponentId(songGiantA);
    store.getComponentId(songIsland2);
  }
  const elapsed10kMs = performance.now() - t0;
  assert.ok(elapsed10kMs < 50, `10,000 getComponentId lookups took ${elapsed10kMs.toFixed(2)}ms (< 50ms)`);

  const badgeConnected = checkInstantConnectivity(
    { mode: "song", id: songGiantA },
    { mode: "song", id: songGiantB }
  );
  assert.ok(badgeConnected && badgeConnected.isConnected === true, "Same component songs must be connected");
  assert.strictEqual(badgeConnected?.startComponentId, 1);
  assert.strictEqual(badgeConnected?.targetComponentId, 1);

  const badgeDisconnected = checkInstantConnectivity(
    { mode: "song", id: songGiantA },
    { mode: "song", id: songIsland2 }
  );
  assert.ok(
    badgeDisconnected && badgeDisconnected.isConnected === false,
    "Different component songs must be marked disconnected"
  );
  assert.strictEqual(badgeDisconnected?.startComponentId, 1);
  assert.strictEqual(badgeDisconnected?.targetComponentId, 2);
  console.log(
    `  -> PASS: 10,000 O(1) lookups in ${elapsed10kMs.toFixed(2)}ms; Connected/Disconnected badges verified`
  );

  console.log("\n[Test 5] Step 13-3 Layer 2: REASON_A (Different Components & Bidirectional 3-Song Recommendations)");
  const resReasonA = diagnoseQuestPair(songGiantA, songIsland2, { turnDistance: "any" });
  assert.strictEqual(resReasonA.ok, false);
  assert.strictEqual(resReasonA.diagnostics?.reason, "REASON_A");
  const altTargets = resReasonA.diagnostics?.alternativeTargetsInStartComp || [];
  const altStarts = resReasonA.diagnostics?.alternativeStartsInTargetComp || [];
  assert.strictEqual(altTargets.length, 3, "Must recommend 3 alternative target songs in start component");
  assert.strictEqual(altStarts.length, 3, "Must recommend 3 alternative start songs in target component");

  // 추천된 대체 도착곡으로 교체 시 실제로 연결 성공(ok: true)하는지 검증
  const replacedTargetRes = diagnoseQuestPair(songGiantA, altTargets[0].song.id, {
    turnDistance: "any"
  });
  assert.strictEqual(
    replacedTargetRes.ok,
    true,
    "Replacing target song with recommended song in start component must succeed"
  );

  // 반대 방향: 추천된 대체 출발곡으로 교체 시 실제로 연결 성공(ok: true)하는지 검증
  const replacedStartRes = diagnoseQuestPair(altStarts[0].song.id, songIsland2, {
    turnDistance: "any"
  });
  assert.strictEqual(
    replacedStartRes.ok,
    true,
    "Replacing start song with recommended song in target component must succeed"
  );
  console.log(
    `  -> PASS: REASON_A diagnosed; Alt Target #1 = '${altTargets[0].song.display}', Alt Start #1 = '${altStarts[0].song.display}'`
  );

  console.log("\n[Test 6] Step 13-3 Layer 2: REASON_B (Role Filter Restriction & Empty allowedRoles=[])");
  const seed0 = seeds[0];
  const unrestrictedPath = engine.findShortestPath(seed0.start_song_id, seed0.target_song_id);
  assert.strictEqual(unrestrictedPath.found, true);

  const startEdges = store.songEdges.get(seed0.start_song_id) || [];
  const startRoles = new Set<number>();
  startEdges.forEach(([, roles]) => roles.forEach((r) => startRoles.add(r)));
  const unusedRole = ([5, 2, 6, 3, 4, 1] as const).find((r) => !startRoles.has(r)) || 5;

  const resReasonB = diagnoseQuestPair(seed0.start_song_id, seed0.target_song_id, {
    allowedRoles: [unusedRole],
    turnDistance: "any"
  });
  assert.strictEqual(resReasonB.ok, false);
  assert.strictEqual(resReasonB.diagnostics?.reason, "REASON_B");
  assert.ok(
    (resReasonB.diagnostics?.missingRoles?.length || 0) >= 1,
    "REASON_B must report at least 1 missing RoleCode on the shortest path"
  );

  // 빈 배열(allowedRoles: []) 입력 시에도 REASON_B로 정확히 차단되는지 확인
  const resEmptyRoles = diagnoseQuestPair(seed0.start_song_id, seed0.target_song_id, {
    allowedRoles: [],
    turnDistance: "any"
  });
  assert.strictEqual(resEmptyRoles.ok, false, "Empty allowedRoles [] must not bypass role filter");
  assert.strictEqual(resEmptyRoles.diagnostics?.reason, "REASON_B");

  // [모두 켜기] 액션 시뮬레이션: allowedRoles 해제 시 즉시 성공 확인
  const resolvedReasonB = diagnoseQuestPair(seed0.start_song_id, seed0.target_song_id, {
    allowedRoles: undefined,
    turnDistance: "any"
  });
  assert.strictEqual(resolvedReasonB.ok, true);
  console.log(
    `  -> PASS: REASON_B diagnosed (including empty allowedRoles=[]); Missing roles = [${resReasonB.diagnostics?.missingRoleLabels?.join(", ")}]`
  );

  console.log("\n[Test 7] Step 13-3 Layer 2: REASON_C (Distance Mismatch: TOO_LONG vs TOO_SHORT)");
  const standardSeed = seeds.find((s) => s.optimal_turns === 4)!;
  const resTooLong = diagnoseQuestPair(standardSeed.start_song_id, standardSeed.target_song_id, {
    turnDistance: "short"
  });
  assert.strictEqual(resTooLong.ok, false);
  assert.strictEqual(resTooLong.diagnostics?.reason, "REASON_C");
  assert.strictEqual(resTooLong.diagnostics?.distanceMismatchDirection, "TOO_LONG");
  assert.ok(
    (resTooLong.diagnostics?.actualTurns || 0) > (resTooLong.diagnostics?.requestedMaxTurns || 2),
    "actualTurns must be > maxTurns for TOO_LONG"
  );

  const resolvedTooLong = diagnoseQuestPair(standardSeed.start_song_id, standardSeed.target_song_id, {
    turnDistance: resTooLong.diagnostics?.recommendedTurnDistance
  });
  assert.strictEqual(resolvedTooLong.ok, true, "Applying recommendedTurnDistance must resolve TOO_LONG");

  const shortSeed = seeds.find((s) => s.optimal_turns === 2)!;
  const resTooShort = diagnoseQuestPair(shortSeed.start_song_id, shortSeed.target_song_id, {
    turnDistance: "long"
  });
  assert.strictEqual(resTooShort.ok, false);
  assert.strictEqual(resTooShort.diagnostics?.reason, "REASON_C");
  assert.strictEqual(resTooShort.diagnostics?.distanceMismatchDirection, "TOO_SHORT");
  assert.ok(
    (resTooShort.diagnostics?.actualTurns || 0) < (resTooShort.diagnostics?.requestedMinTurns || 5),
    "actualTurns must be < minTurns for TOO_SHORT"
  );

  const resolvedTooShort = diagnoseQuestPair(shortSeed.start_song_id, shortSeed.target_song_id, {
    turnDistance: resTooShort.diagnostics?.recommendedTurnDistance
  });
  assert.strictEqual(resolvedTooShort.ok, true, "Applying recommendedTurnDistance must resolve TOO_SHORT");
  console.log(
    `  -> PASS: REASON_C TOO_LONG (actual=${resTooLong.diagnostics?.actualTurns} > max=2) and TOO_SHORT (actual=${resTooShort.diagnostics?.actualTurns} < min=5) verified`
  );

  console.log("\n[Test 8] Edge Case: 1-Song Isolated Island Handling");
  let singleSongCompId: number | null = null;
  for (const [compId, songList] of store.componentSongIds.entries()) {
    if (songList.length === 1) {
      singleSongCompId = compId;
      break;
    }
  }
  assert.ok(singleSongCompId !== null, "Must find a 1-song isolated component");
  const isolatedSongId = store.getComponentSongs(singleSongCompId!)[0];

  // 1곡 단독 고립 섬을 출발/도착에 동시 지정 시 isConnected는 false여야 함
  const badgeSelfIsolated = checkInstantConnectivity(
    { mode: "song", id: isolatedSongId },
    { mode: "song", id: isolatedSongId }
  );
  assert.strictEqual(
    badgeSelfIsolated?.isConnected,
    false,
    "1-song isolated island cannot be connected even to itself"
  );

  const resIsolated = generateCustomQuest({
    startMode: "song",
    startId: isolatedSongId,
    targetMode: "random"
  });
  assert.strictEqual(resIsolated.ok, false);
  assert.strictEqual(resIsolated.diagnostics?.reason, "REASON_A");
  assert.strictEqual(resIsolated.diagnostics?.startComponentSize, 1);
  assert.strictEqual(
    resIsolated.diagnostics?.alternativeTargetsInStartComp?.length,
    0,
    "1-song island has 0 other songs in its own component"
  );
  assert.strictEqual(
    resIsolated.diagnostics?.alternativeStartsInTargetComp?.length,
    3,
    "Should still recommend 3 alternative start songs in the target (Giant) component"
  );
  console.log("  -> PASS: 1-Song isolated island edge case handled cleanly without crash");

  console.log("\n[Test 9] Custom Quest Generation Performance & Recall on Short Distance (1~2 turns)");
  const tShortStart = performance.now();
  const shortFromFixedStart = generateCustomQuest({
    startMode: "song",
    startId: seed0.start_song_id,
    targetMode: "random",
    turnDistance: "short"
  });
  const shortFromFixedTarget = generateCustomQuest({
    startMode: "random",
    targetMode: "song",
    targetId: seed0.target_song_id,
    turnDistance: "short"
  });
  const shortElapsedMs = performance.now() - tShortStart;
  assert.strictEqual(shortFromFixedStart.ok, true, "Must find a 1~2 turn target song from fixed start song");
  assert.ok(
    (shortFromFixedStart.quest?.optimalTurns || 99) <= 2,
    "Generated short quest from fixed start must be <= 2 turns"
  );
  assert.strictEqual(shortFromFixedTarget.ok, true, "Must find a 1~2 turn start song from fixed target song");
  assert.ok(
    (shortFromFixedTarget.quest?.optimalTurns || 99) <= 2,
    "Generated short quest from fixed target must be <= 2 turns"
  );
  assert.ok(shortElapsedMs < 500, `Both short-distance custom quest generations took ${shortElapsedMs.toFixed(1)}ms (< 500ms)`);
  console.log(
    `  -> PASS: Short-distance (1~2 turns) custom quests generated with 100% accuracy in ${shortElapsedMs.toFixed(1)}ms`
  );

  console.log("\n=== ALL PHASE 13 VERIFICATION TESTS PASSED (9/9) ===");
}

runTests().catch((err) => {
  console.error("Verification failed:", err);
  process.exit(1);
});
