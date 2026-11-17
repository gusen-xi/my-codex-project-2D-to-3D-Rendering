"""在现有 wuyin-mysql 容器的独立临时库验证；不修改 wuyin 数据库。"""
from pathlib import Path
import shutil
import subprocess
import uuid

DOCKER = shutil.which('docker') or '/Applications/Docker.app/Contents/Resources/bin/docker'
DATABASE = 'wuyin_schema_check_' + uuid.uuid4().hex[:12]
SCHEMA = Path(__file__).with_name('001_create_tables.sql').read_text()


def sql(statement, database=None, expect_success=True):
    # 密码只在容器内从既有环境读取，不写入命令参数或输出。
    command = [DOCKER, 'exec', '-i', 'wuyin-mysql', 'sh', '-c',
               'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql -uroot --default-character-set=utf8mb4 --batch --skip-column-names "$@"',
               'mysql']
    if database:
        command.append(database)
    result = subprocess.run(command, input=statement, text=True, capture_output=True)
    if expect_success and result.returncode:
        raise RuntimeError(result.stderr)
    if not expect_success and not result.returncode:
        raise AssertionError('非法数据未被约束拒绝：' + statement)
    return result.stdout.strip()


try:
    sql(f'CREATE DATABASE `{DATABASE}` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;')
    sql(SCHEMA, DATABASE)
    sql(SCHEMA, DATABASE)  # 可重复执行，不删除数据。
    assert sql('SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE();', DATABASE) == '7'
    sql("""
    INSERT INTO users(username,password_hash,password_salt) VALUES ('schema_test','test-only-not-a-password','test-salt');
    INSERT INTO projects(user_id,name) VALUES (1,'结构验证项目');
    INSERT INTO assets(project_id,kind,original_name,storage_path,mime_type) VALUES
      (1,'plan_page','plan.png','test/plan.png','image/png'),
      (1,'generated','result.png','test/result.png','image/png');
    INSERT INTO rooms(project_id,plan_asset_id,name,rect_x,rect_y,rect_w,rect_h,structure_notes)
      VALUES (1,1,'客厅',0.1,0.1,0.5,0.5,'门窗位置待人工核对');
    INSERT INTO model_tasks(id,project_id,requested_by,request_id,room_id,source_asset_id,action,status,request_snapshot,consented_at)
      VALUES ('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',1,1,'request-1',1,1,'generate','completed',
      '{"confirmed":true,"style":"现代简约","camera":{"x":0.5,"y":0.8,"angle":270}}',UTC_TIMESTAMP(3));
    INSERT INTO render_versions(project_id,room_id,task_id,image_asset_id,version_no,name,origin)
      VALUES (1,1,'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',2,1,'V01','plan_generate');
    INSERT INTO version_reviews(version_id,reviewer_id,usable_for_client) VALUES (1,1,1);
    """, DATABASE)
    for statement in [
        "INSERT INTO users(username,password_hash,password_salt) VALUES ('schema_test','x','y');",
        "UPDATE rooms SET rect_x=0.9 WHERE id=1;",
        "UPDATE rooms SET camera_angle=12 WHERE id=1;",
        "INSERT INTO model_tasks(id,project_id,requested_by,request_id,source_asset_id,action,request_snapshot,consented_at) VALUES ('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',1,1,'request-1',1,'analyze','{}',UTC_TIMESTAMP(3));",
        "INSERT INTO projects(user_id,name) VALUES (999999,'无效所有者');",
        "UPDATE version_reviews SET structure_preserved=2 WHERE id=1;",
        "DELETE FROM users WHERE id=1;",
    ]:
        sql(statement, DATABASE, expect_success=False)
    assert sql('SELECT usable_for_client FROM version_reviews WHERE version_id=1;', DATABASE) == '1'
    print('通过：7张表、重复建表、完整业务链路、用户名唯一、任务幂等、外键、选区/八向/评价约束及删除保护。')
finally:
    sql(f'DROP DATABASE IF EXISTS `{DATABASE}`;')
