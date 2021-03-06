 #!/usr/bin/env python

import boto
import imp
import json
import os
import subprocess
import sys
import webbrowser

from distutils.spawn import find_executable
from fabric.api import local, prompt, require, settings, task
from fabric.state import env
from glob import glob
from oauth import get_document, get_credentials
from time import sleep

import app_config
import assets
import ftp as flat
import render
import utils

from render_utils import load_graphic_config
from etc.gdocs import GoogleDoc

SPREADSHEET_COPY_URL_TEMPLATE = 'https://www.googleapis.com/drive/v2/files/%s/copy'
SPREADSHEET_VIEW_TEMPLATE = 'https://docs.google.com/spreadsheet/ccc?key=%s#gid=1'

"""
Base configuration
"""
env.settings = None

"""
Environments

Changing environment requires a full-stack test.
An environment points to both a server and an S3
bucket.
"""
@task
def production():
    """
    Run as though on production.
    """
    env.settings = 'production'
    app_config.configure_targets(env.settings)

@task
def staging():
    """
    Run as though on staging.
    """
    env.settings = 'staging'
    app_config.configure_targets(env.settings)

"""
Running the app
"""
@task
def app(port='8000'):
    """
    Serve app.py.
    """
    local('gunicorn -b 0.0.0.0:%s --timeout 3600 --debug --reload app:wsgi_app' % port)

"""
Deployment

Changes to deployment requires a full-stack test. Deployment
has two primary functions: Pushing flat files to S3 and deploying
code to a remote server if required.
"""
@task
def deploy_to_production(slug):
    require('settings', provided_by=[production, staging])

    graphic_root = '%s/%s' % (app_config.GRAPHICS_PATH, slug)
    graphic_assets = '%s/assets' % graphic_root
    graphic_config = load_graphic_config(graphic_root)
    default_max_age = getattr(graphic_config, 'DEFAULT_MAX_AGE', None) or app_config.DEFAULT_MAX_AGE

    flat.deploy_folder(
        graphic_root,
        slug,
        headers={
            'Cache-Control': 'max-age=%i' % default_max_age
        },
        ignore=['%s/*' % graphic_assets]
    )

    write_meta_json(slug, 'deploy')

@task
def update_from_content(slug):
    require('settings', provided_by=[production, staging])

    if not slug:
        print 'You must specify a project slug, like this: "update_from_content:slug"'
        return

    update_copy(slug)
    render.render(slug)
    write_meta_json(slug, 'content')

@task
def update_from_template(slug, template):
    require('settings', provided_by=[production, staging])

    if not slug:
        print 'You must specify a project slug and template, like this: "update_from_template:slug,template=template"'
        return

    recopy_templates(slug, template)
    render.render(slug)
    write_meta_json(slug, 'template', template)

@task
def debug_deploy(slug, template):
    require('settings', provided_by=[production, staging])

    if not slug:
        print 'You must specify a project slug and template, like this: "debug_deploy:slug,template=template"'
        return

    recopy_templates(slug, template)
    # update_copy(slug)
    # write_meta_json(slug, 'content')
    render.render(slug)
    write_meta_json(slug, 'template', template)

def write_meta_json(slug, action, template=''):
    meta_path = '%s/%s/meta.json' % (app_config.GRAPHICS_PATH, slug)

    import json
    try:
        with open(meta_path) as f:
            json_data = json.load(f)
    except: # catch *all* exceptions
        default_json_str = '{"production": {"date": ""}, "staging": {"content": {"date": ""}, "template": {"date": "", "type": ""}}}'
        json_data = json.loads(default_json_str)

    import time
    date_string = int(time.time())

    if "content" == action:
        json_data["staging"]["content"]["date"] = date_string
    elif "template" == action:
        json_data["staging"]["template"]["date"] = date_string
        json_data["staging"]["template"]["type"] = template
    elif "deploy" == action:
        json_data["production"]["date"] = date_string

    with open(meta_path, 'w') as f:
        json.dump(json_data, f)

def recopy_templates(slug, template):
    graphic_path = '%s/%s' % (app_config.GRAPHICS_PATH, slug)

    print 'Recopying templates...'
    local('mv %s/graphic_config.py %s/graphic_config.py.BACKUP' % (graphic_path, graphic_path))
    local('cp -r graphic_templates/_base/* %s' % (graphic_path))
    local('cp -r graphic_templates/%s/* %s' % (template, graphic_path))
    local('mv %s/graphic_config.py.BACKUP %s/graphic_config.py' % (graphic_path, graphic_path))

def download_copy(slug):
    """
    Downloads a Google Doc as an .xlsx file.
    """
    graphic_path = '%s/%s' % (app_config.GRAPHICS_PATH, slug)

    try:
        graphic_config = load_graphic_config(graphic_path)
    except IOError:
        print '%s/graphic_config.py does not exist.' % slug
        return

    if not hasattr(graphic_config, 'COPY_GOOGLE_DOC_KEY') or not graphic_config.COPY_GOOGLE_DOC_KEY:
        print 'COPY_GOOGLE_DOC_KEY is not defined in %s/graphic_config.py.' % slug
        return

    copy_path = os.path.join(graphic_path, '%s.xlsx' % slug)
    get_document(graphic_config.COPY_GOOGLE_DOC_KEY, copy_path)

@task
def update_copy(slug=None):
    """
    Fetches the latest Google Doc and updates local JSON.
    """
    print '\nUpdating content...'

    if slug:
        download_copy(slug)
        return

    slugs = os.listdir(app_config.GRAPHICS_PATH)

    for slug in slugs:
        graphic_path = '%s/%s' % (app_config.GRAPHICS_PATH, slug)

        if not os.path.exists('%s/graphic_config.py' % graphic_path):
            continue

        print slug
        download_copy(slug)


"""
App-specific commands
"""
def _add_graphic(slug, template, debug=False):
    """
    Create a graphic with `slug` from `template`
    """
    graphic_path = '%s/%s' % (app_config.GRAPHICS_PATH, slug)

    if _check_slug(slug):
        return

    if not debug:
        _check_credentials()

    print '\nCopying templates...'
    local('cp -r graphic_templates/_base %s' % (graphic_path))
    local('cp -r graphic_templates/%s/* %s' % (template, graphic_path))

    if debug:
        local('cp debug.xlsx %s/%s.xlsx' % (graphic_path, slug))

    config_path = os.path.join(graphic_path, 'graphic_config.py')

    if not debug and os.path.isfile(config_path):
        print '\nCreating spreadsheet...'

        success = copy_spreadsheet(slug)

        if success:
            download_copy(slug)
        else:
            local('rm -r graphic_path')
            print 'Failed to copy spreadsheet! Try again!'
            return
    else:
        print 'No graphic_config.py found, not creating spreadsheet'

    # print 'Run `fab app` and visit http://127.0.0.1:8000/graphics/%s to view' % slug

def _check_slug(slug):
    """
    Does slug exist in graphics folder or production s3 bucket?
    """
    graphic_path = '%s/%s' % (app_config.GRAPHICS_PATH, slug)
    if os.path.isdir(graphic_path):
        print 'Error: Directory already exists'
        return True

    #try:
    #    s3 = boto.connect_s3()
    #    bucket = s3.get_bucket(app_config.PRODUCTION_S3_BUCKET['bucket_name'])
    #    key = bucket.get_key('%s/graphics/%s/child.html' % (app_config.PROJECT_SLUG, slug))
    #
    #    if key:
    #        print 'Error: Slug exists on apps.npr.org'
    #        return True
    #except boto.exception.NoAuthHandlerFound:
    #    print 'Could not authenticate, skipping Amazon S3 check'
    #except boto.exception.S3ResponseError:
    #    print 'Could not access S3 bucket, skipping Amazon S3 check'

    return False

@task
def add_graphic(slug):
    """
    Create a basic project.
    """
    _add_graphic(slug, 'graphic')

@task
def add_bar_chart(slug, debug=False):
    """
    Create a bar chart.
    """
    _add_graphic(slug, 'bar_chart', debug)

@task
def add_column_chart(slug, debug=False):
    """
    Create a column chart.
    """
    _add_graphic(slug, 'column_chart', debug)

@task
def add_stacked_column_chart(slug, debug=False):
    """
    Create a stacked column chart.
    """
    _add_graphic(slug, 'stacked_column_chart', debug)

@task
def add_block_histogram(slug, debug=False):
    """
    Create a block histogram.
    """
    _add_graphic(slug, 'block_histogram', debug)

@task
def add_grouped_bar_chart(slug, debug=False):
    """
    Create a grouped bar chart.
    """
    _add_graphic(slug, 'grouped_bar_chart', debug)

@task
def add_stacked_bar_chart(slug, debug=False):
    """
    Create a stacked bar chart.
    """
    _add_graphic(slug, 'stacked_bar_chart', debug)

@task
def add_state_grid_map(slug):
    """
    Create a state grid cartogram
    """
    _add_graphic(slug, 'state_grid_map')

@task
def add_line_chart(slug, debug=False):
    """
    Create a line chart.
    """
    _add_graphic(slug, 'line_chart', debug)

@task
def add_pie_chart(slug, debug=False):
    """
    Create a pie chart.
    """
    _add_graphic(slug, 'pie_chart', debug)

@task
def add_dot_chart(slug):
    """
    Create a dot chart with error bars
    """
    _add_graphic(slug, 'dot_chart')

@task
def add_slopegraph(slug, debug=False):
    """
    Create a slopegraph (intended for narrow display)
    """
    _add_graphic(slug, 'slopegraph', debug)

@task
def add_scatterplot(slug, debug=False):
    """
    Create a scatterplot.
    """
    _add_graphic(slug, 'scatterplot', debug)

@task
def add_bubbleplot(slug, debug=False):
    """
    Create a bubbleplot.
    """
    _add_graphic(slug, 'bubbleplot', debug)

@task
def add_map(slug):
    """
    Create a locator map.
    """
    _add_graphic(slug, 'locator_map')

@task
def add_table(slug):
    """
    Create a data table.
    """
    _add_graphic(slug, 'table')

def _check_credentials():
    """
    Check credentials and spawn server and browser if not
    """
    credentials = get_credentials()
    if not credentials or 'https://www.googleapis.com/auth/drive' not in credentials.config['google']['scope']:
        try:
            with open(os.devnull, 'w') as fnull:
                print 'Credentials were not found or permissions were not correct. Automatically opening a browser to authenticate with Google.'
                gunicorn = find_executable('gunicorn')
                process = subprocess.Popen([gunicorn, '-b', '0.0.0.0:8888', 'app:wsgi_app'], stdout=fnull, stderr=fnull, cwd=app_config.PROJECT_DIR)
                print 'Visit newsdev3:8888/oauth'
                # webbrowser.open_new('http://127.0.0.1:8888/oauth')
                print 'Waiting...'
                while not credentials:
                    try:
                        credentials = get_credentials()
                        sleep(1)
                    except ValueError:
                        continue
                print 'Successfully authenticated!'
                process.terminate()
        except KeyboardInterrupt:
            print '\nCtrl-c pressed. Later, skater!'
            exit()

def copy_spreadsheet(slug):
    """
    Copy the COPY spreadsheet
    """
    _check_credentials()

    config_path = '%s/%s/' % (app_config.GRAPHICS_PATH, slug)
    graphic_config = load_graphic_config(config_path)

    if not hasattr(graphic_config, 'COPY_GOOGLE_DOC_KEY') or not graphic_config.COPY_GOOGLE_DOC_KEY:
        print 'Skipping spreadsheet creation. (COPY_GOOGLE_DOC_KEY is not defined in %s/graphic_config.py.)' % slug
        return

    kwargs = {
        'credentials': get_credentials(),
        'url': SPREADSHEET_COPY_URL_TEMPLATE % graphic_config.COPY_GOOGLE_DOC_KEY,
        'method': 'POST',
        'headers': {'Content-Type': 'application/json'},
        'body': json.dumps({
            'title': '%s GRAPHIC COPY' % slug,
        }),
    }

    resp = app_config.authomatic.access(**kwargs)

    if resp.status == 200:
        spreadsheet_key = resp.data['id']
        spreadsheet_url = SPREADSHEET_VIEW_TEMPLATE % spreadsheet_key
        print 'New spreadsheet created successfully!'
        print 'View it online at %s' % spreadsheet_url
        utils.replace_in_file('%s/graphic_config.py' % config_path , graphic_config.COPY_GOOGLE_DOC_KEY, spreadsheet_key)

        return True

        utils.replace_in_file(config_path, graphic_config.COPY_GOOGLE_DOC_KEY, '')

    print 'Error creating spreadsheet (status code %s) with message %s' % (resp.status, resp.reason)
    return False
