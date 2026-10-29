// @effect-diagnostics nodeBuiltinImport:off - execute the bundled Python worker against disposable filesystem fixtures.
import * as NodeChildProcess from "node:child_process";
import * as HostProcess from "@t3tools/shared/HostProcess";
import { describe, expect, it } from "@effect/vitest";
import { STORAGE_ARCHIVE_PROGRAM } from "./storageArchiveProgram.ts";

// The worker uses macOS ACL and volume APIs; all fixture data stays in temporary directories.
describe.skipIf(HostProcess.Platform.defaultValue() !== "darwin")(
  "storage inventory worker",
  () => {
    it("classifies generated data without granting release, refuses symlinks, and resolves listed artifact IDs", () => {
      const setup = `
import tempfile
with tempfile.TemporaryDirectory() as temporary:
 base=Path(temporary).resolve();state=base/'storage-management'
 project=base/'scratch'/'project';project.mkdir(parents=True)
 deps=project/'node_modules';deps.mkdir();(deps/'sample').write_bytes(b'x'*8192)
 build=project/'dist';build.mkdir();(build/'output').write_bytes(b'y'*4096)
 outside=base/'private';outside.mkdir();(project/'linked').symlink_to(outside,target_is_directory=True)
 backup=base/'backups'/'old';backup.mkdir(parents=True)
 vol=[{'path':str(base)}]
 rows,limited=inventory(vol,project)
 assert {r['kind'] for r in rows}=={'dependencies','builds'}
 assert all(r['canRelease'] is False and r['canArchive'] is True and r['canExpand'] is False for r in rows)
 for r in rows:
  req['objectId']=r['id'];assert getrow()['path']==r['path']
 measure_inventory(rows)
 assert all(r.get('bytes',0)>0 for r in rows)
 assert all((project/Path(r['path']).name).is_dir() for r in rows)
 assert source(deps)==deps
 try:source(project/'linked');raise AssertionError('symlink accepted')
 except ValueError:pass
 print(json.dumps({'measured':len(rows),'limited':limited}))
`;
      const prefix = STORAGE_ARCHIVE_PROGRAM.slice(
        0,
        STORAGE_ARCHIVE_PROGRAM.indexOf("def main():"),
      );
      const output = NodeChildProcess.execFileSync("/usr/bin/python3", ["-c", prefix + setup], {
        input: JSON.stringify({ base: "/tmp", action: "inspect" }),
        encoding: "utf8",
      });
      expect(JSON.parse(output)).toEqual({ measured: 2, limited: false });
    });
    it("archives only expired rotated logs, rejects drift, and preserves a recoverable copy", () => {
      const setup = `
import tempfile
with tempfile.TemporaryDirectory() as temporary:
 base=Path(temporary).resolve();state=base/'storage-management';root=base/'userdata/logs';root.mkdir(parents=True)
 old=root/'worker.log.1';old.write_bytes(b'old-log\\n'*8192)
 now=time.time();os.utime(old,(now-31*86400,now-31*86400))
 live=root/'worker.log';live.write_text('keep current');os.utime(live,(now-50*86400,now-50*86400))
 recent=root/'worker.log.2';recent.write_text('keep recent')
 link=root/'linked.log.3';link.symlink_to(old)
 plan=log_cleanup_plan();assert [r['path'] for r in plan['items']]==[str(old)]
 original=old.read_bytes();old.write_bytes(b'changed')
 try:log_cleanup_run(plan);raise AssertionError('changed log deleted')
 except ValueError:pass
 assert old.exists() and live.exists() and recent.exists()
 old.write_bytes(original);os.utime(old,(now-31*86400,now-31*86400))
 plan=log_cleanup_plan();result=log_cleanup_run(plan)
 assert result['phase']=='completed' and not old.exists()
 assert live.read_text()=='keep current' and recent.read_text()=='keep recent' and link.is_symlink()
 records=catalog();assert len(records)==1
 arc=Path(records[0]['archive']);assert digest(arc)==records[0]['archive_sha256']
 restore={'id':str(uuid.uuid4()),'type':'restore','archiveId':records[0]['id'],'destination':str(base/'restored'/'verify'),'sourceBytes':len(original),'reserveGiB':0,'spacePath':str(base)}
 restored=restore_run(restore)
 assert restored['phase']=='completed' and (Path(restore['destination'])/'worker.log.1').read_bytes()==original
 assert old.exists() is False
 print(json.dumps({'archived':True,'restored':True,'currentKept':True}))
`;
      const prefix = STORAGE_ARCHIVE_PROGRAM.slice(
        0,
        STORAGE_ARCHIVE_PROGRAM.indexOf("def main():"),
      );
      const output = NodeChildProcess.execFileSync("/usr/bin/python3", ["-c", prefix + setup], {
        input: JSON.stringify({ base: "/tmp", action: "inspect" }),
        encoding: "utf8",
      });
      expect(JSON.parse(output)).toEqual({ archived: true, restored: true, currentKept: true });
    });
  },
);
